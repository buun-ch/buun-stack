import os
from datetime import datetime, timedelta
from typing import Any, Dict

import dlt
import duckdb
from dlt.common.schema.typing import TWriteDispositionConfig
from dlt.sources.filesystem import readers

from airflow import DAG
from airflow.providers.standard.operators.python import PythonOperator


class DltResource:
    """DLT resource for data pipeline operations in Airflow."""

    def __init__(self):
        self.pipeline_name = "minio_to_postgres"
        self.destination = "postgres"
        self.dataset_name = "movielens_af"

    def setup_environment(self):
        """Setup environment variables for dlt."""
        # PostgreSQL configuration
        postgres_url = os.getenv("POSTGRES_URL", "")
        os.environ["DESTINATION__POSTGRES__CREDENTIALS"] = (
            f"{postgres_url}/{self.dataset_name}"
        )

        # Enable detailed logging for dlt
        os.environ["DLT_LOG_LEVEL"] = "INFO"

    def create_pipeline(self, table_name: str):
        """Create dlt pipeline with optional table-specific name."""
        self.setup_environment()

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

        print(f"Reading CSV from s3://{bucket}/{file_glob}")

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
        conn: duckdb.DuckDBPyConnection | None = None

        try:
            postgres_url = os.getenv("POSTGRES_URL", "")
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

            conn = duckdb.connect()
            conn.execute("INSTALL postgres_scanner")
            conn.execute("LOAD postgres_scanner")

            attach_cmd = f"""
            ATTACH 'host={host} port={port} dbname={self.dataset_name} user={user} password={password}' AS postgres_db (TYPE postgres)
            """
            conn.execute(attach_cmd)

            query = f"""
            SELECT COUNT(*) as row_count
            FROM postgres_db.{self.dataset_name}.{table_name}
            LIMIT 1
            """

            result = conn.execute(query).fetchone()
            row_count = result[0] if result else 0

            print(f"Table {table_name} has {row_count} rows")
            return row_count > 0

        except Exception as e:
            print(f"Table {table_name} does not exist or is empty: {e}")
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
        pipeline = self.create_pipeline(table_name=table_name)

        print(f"Running pipeline '{pipeline.pipeline_name}' for table {table_name}")

        pipeline.config.progress = "log"

        load_info = pipeline.run(
            resource_data, table_name=table_name, write_disposition=write_disposition
        )

        print(f"Pipeline completed for {table_name}")

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


# Task functions
def process_movies_table(**context):
    """Load movies CSV from MinIO to PostgreSQL using dlt."""
    dlt_resource = DltResource()

    print("Starting movies pipeline...")

    table_exists = dlt_resource.table_exists_and_has_data("movies")
    if table_exists:
        print("Movies table already exists with data, skipping import")
        return {"status": "skipped", "reason": "table already exists with data"}

    print("Reading movies.csv from MinIO...")
    movies_data = dlt_resource.read_csv_from_s3(
        bucket="movie-lens", file_glob="movies.csv"
    )

    movies_data.apply_hints(primary_key="movieId")

    result = dlt_resource.run_pipeline(
        movies_data,
        table_name="movies",
        write_disposition="replace",
    )

    print(f"Movies pipeline completed: {result}")
    return result


def process_ratings_table(**context):
    """Load ratings CSV from MinIO to PostgreSQL using dlt."""
    dlt_resource = DltResource()

    print("Starting ratings pipeline...")

    table_exists = dlt_resource.table_exists_and_has_data("ratings")
    if table_exists:
        print("Ratings table already exists with data, skipping import")
        return {"status": "skipped", "reason": "table already exists with data"}

    print("Reading ratings.csv from MinIO...")
    ratings_data = dlt_resource.read_csv_from_s3(
        bucket="movie-lens", file_glob="ratings.csv"
    )

    ratings_data.apply_hints(primary_key=["userId", "movieId"])

    result = dlt_resource.run_pipeline(
        ratings_data, table_name="ratings", write_disposition="replace"
    )

    print(f"Ratings pipeline completed: {result}")
    return result


def process_tags_table(**context):
    """Load tags CSV from MinIO to PostgreSQL using dlt."""
    dlt_resource = DltResource()

    print("Starting tags pipeline...")

    table_exists = dlt_resource.table_exists_and_has_data("tags")
    if table_exists:
        print("Tags table already exists with data, skipping import")
        return {"status": "skipped", "reason": "table already exists with data"}

    print("Reading tags.csv from MinIO...")
    tags_data = dlt_resource.read_csv_from_s3(bucket="movie-lens", file_glob="tags.csv")

    tags_data.apply_hints(primary_key=["userId", "movieId", "timestamp"])

    result = dlt_resource.run_pipeline(
        tags_data, table_name="tags", write_disposition="replace"
    )

    print(f"Tags pipeline completed: {result}")
    return result


def generate_summary(**context):
    """Generate summary of all loaded MovieLens data."""
    dlt_resource = DltResource()

    print("Generating summary of MovieLens dataset...")

    pipeline_names = ["movies", "ratings", "tags"]
    schema_info = {}
    tables_found = []

    for table_name in pipeline_names:
        try:
            pipeline = dlt_resource.create_pipeline(table_name=table_name)

            if pipeline.default_schema_name in pipeline.schemas:
                schema = pipeline.schemas[pipeline.default_schema_name]
                print(f"Found schema for pipeline '{pipeline.pipeline_name}'")
                schema_info[table_name] = {
                    "pipeline": pipeline.pipeline_name,
                    "schema_version": schema.version,
                }
                tables_found.extend(
                    [t for t in schema.tables.keys() if t == table_name]
                )
        except Exception as e:
            print(f"Could not get schema for {table_name}: {e}")

    print(
        f"Summary: Found {len(tables_found)} tables from {len(schema_info)} pipelines"
    )

    return {
        "base_pipeline_name": dlt_resource.pipeline_name,
        "dataset_name": dlt_resource.dataset_name,
        "destination": dlt_resource.destination,
        "pipelines_checked": list(schema_info.keys()),
        "tables_found": tables_found,
        "movielens_tables_count": len(tables_found),
        "schema_info": schema_info,
    }


# Default arguments for the DAG
default_args = {
    "owner": "data-team",
    "depends_on_past": False,
    "start_date": datetime(2024, 1, 1),
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 1,
    "retry_delay": timedelta(minutes=5),
}

# Create the DAG
dag = DAG(
    "csv_to_postgres",
    default_args=default_args,
    description="Load MovieLens CSV data from MinIO to PostgreSQL using dlt",
    schedule=None,  # Manual trigger only
    catchup=False,
    tags=["etl", "movielens", "dlt"],
)

# Create tasks
movies_task = PythonOperator(
    task_id="process_movies",
    python_callable=process_movies_table,
    dag=dag,
)

ratings_task = PythonOperator(
    task_id="process_ratings",
    python_callable=process_ratings_table,
    dag=dag,
)

tags_task = PythonOperator(
    task_id="process_tags",
    python_callable=process_tags_table,
    dag=dag,
)

summary_task = PythonOperator(
    task_id="generate_summary",
    python_callable=generate_summary,
    dag=dag,
)

# Set task dependencies
[movies_task, ratings_task, tags_task] >> summary_task
