import os
from typing import Any, Dict

import dlt
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

    def create_pipeline(self):
        """Create dlt pipeline."""
        import uuid

        self.setup_environment()

        # Use a unique pipeline name to avoid conflicts
        unique_pipeline_name = f"{self.pipeline_name}_{uuid.uuid4().hex[:8]}"

        return dlt.pipeline(
            pipeline_name=unique_pipeline_name,
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

    def run_pipeline(
        self,
        resource_data,
        table_name: str,
        write_disposition: TWriteDispositionConfig = "replace",
    ) -> Dict[str, Any]:
        """Run dlt pipeline with given resource data."""
        logger = get_dagster_logger()

        pipeline = self.create_pipeline()

        logger.info(f"Running pipeline for table {table_name}")

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
