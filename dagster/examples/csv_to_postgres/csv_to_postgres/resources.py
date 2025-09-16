import os
from typing import Any, Dict

import dlt
import duckdb
from dagster import ConfigurableResource, get_dagster_logger
from dlt.common.schema.typing import TWriteDispositionConfig
from dlt.sources.filesystem import readers


class DltResource(ConfigurableResource):
    """DLT resource for data pipeline operations."""

    pipeline_name: str = "minio_to_postgres"
    destination: str = "postgres"
    dataset_name: str = "movielens"

    def setup_environment(self):
        """Setup environment variables for dlt."""
        # MinIO/S3 configuration
        # os.environ["AWS_ACCESS_KEY_ID"]
        # os.environ["AWS_SECRET_ACCESS_KEY"]
        # os.environ["AWS_ENDPOINT_URL"]

        # PostgreSQL configuration
        postgres_url = os.getenv("POSTGRES_URL", "")
        os.environ["DESTINATION__POSTGRES__CREDENTIALS"] = f"{postgres_url}/movielens"

        # Enable detailed logging for dlt
        os.environ["DLT_LOG_LEVEL"] = "INFO"

    def create_pipeline(self, table_name: str):
        """Create dlt pipeline with optional table-specific name."""
        self.setup_environment()

        # Use table-specific pipeline name if provided, otherwise use base name
        if table_name:
            pipeline_name = f"{self.pipeline_name}_{table_name}"
        else:
            pipeline_name = self.pipeline_name

        return dlt.pipeline(
            pipeline_name=pipeline_name,
            destination=self.destination,
            dataset_name=self.dataset_name,
        )

    def read_csv_from_s3(self, bucket: str, file_glob: str, chunk_size: int = 10000):
        """Read CSV file from S3/MinIO using dlt filesystem readers."""
        self.setup_environment()

        logger = get_dagster_logger()
        logger.info(f"Reading CSV from s3://{bucket}/{file_glob}")

        # Use dlt filesystem readers
        csv_reader = readers(
            bucket_url=f"s3://{bucket}",
            file_glob=file_glob,
        ).read_csv_duckdb(
            chunk_size=chunk_size,
            header=True,
        )

        return csv_reader

    def table_exists_and_has_data(self, table_name: str) -> bool:
        """Check if table exists and has data using DuckDB PostgreSQL scanner."""
        logger = get_dagster_logger()
        conn: duckdb.DuckDBPyConnection | None = None

        try:
            # Get PostgreSQL connection details
            postgres_url = os.getenv("POSTGRES_URL", "")

            # Parse PostgreSQL URL to extract components
            # Format: postgresql://user:password@host:port/database
            url_parts = postgres_url.replace("postgresql://", "").split("/")
            auth_host = url_parts[0]

            if "@" in auth_host:
                auth, host_port = auth_host.split("@")
                if ":" in auth:
                    user, password = auth.split(":", 1)
                else:
                    user, password = auth, ""
            else:
                host_port = auth_host
                user, password = "", ""

            if ":" in host_port:
                host, port = host_port.rsplit(":", 1)
            else:
                host, port = host_port, "5432"

            # Create DuckDB connection and install/load postgres scanner
            conn = duckdb.connect()
            conn.execute("INSTALL postgres_scanner")
            conn.execute("LOAD postgres_scanner")

            # Attach PostgreSQL database
            attach_cmd = f"""
            ATTACH 'host={host} port={port} dbname={self.dataset_name} user={user} password={password}' AS postgres_db (TYPE postgres)
            """
            conn.execute(attach_cmd)

            # Check if table exists and has data
            query = f"""
            SELECT COUNT(*) as row_count
            FROM postgres_db.{self.dataset_name}.{table_name}
            LIMIT 1
            """

            result = conn.execute(query).fetchone()
            row_count = result[0] if result else 0

            logger.info(f"Table {table_name} has {row_count} rows")
            return row_count > 0

        except Exception as e:
            logger.info(f"Table {table_name} does not exist or is empty: {e}")
            return False
        finally:
            try:
                if conn:
                  conn.close()
            except Exception:
                pass

    def run_pipeline(
        self,
        resource_data,
        table_name: str,
        write_disposition: TWriteDispositionConfig = "replace",
        primary_key: str = "",
    ) -> Dict[str, Any]:
        """Run dlt pipeline with given resource data."""
        logger = get_dagster_logger()

        # Create pipeline with table-specific name
        pipeline = self.create_pipeline(table_name=table_name)

        logger.info(
            f"Running pipeline '{pipeline.pipeline_name}' for table {table_name}"
        )

        # Configure pipeline for progress tracking
        pipeline.config.progress = "log"  # Enables progress logging

        # Run the pipeline
        load_info = pipeline.run(
            resource_data, table_name=table_name, write_disposition=write_disposition
        )

        logger.info(f"Pipeline completed for {table_name}")

        # Extract metadata from load_info
        if load_info.load_packages:
            package = load_info.load_packages[0]
            completed_jobs = package.jobs.get("completed_jobs", [])

            total_rows = sum(
                getattr(job, "rows_count", 0)
                for job in completed_jobs
                if hasattr(job, "rows_count")
            )

            return {
                "load_id": load_info.loads_ids[0] if load_info.loads_ids else None,
                "table_name": table_name,
                "completed_jobs": len(completed_jobs),
                "pipeline_name": self.pipeline_name,
                "destination": self.destination,
                "dataset_name": self.dataset_name,
                "write_disposition": write_disposition,
                "total_rows": total_rows,
            }

        return {
            "table_name": table_name,
            "pipeline_name": self.pipeline_name,
            "destination": self.destination,
            "dataset_name": self.dataset_name,
        }
