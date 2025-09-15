from dagster import AssetExecutionContext, MaterializeResult, MetadataValue, asset

from .resources import DltResource


@asset(group_name="movies")
def movies_pipeline(
    context: AssetExecutionContext, dlt: DltResource
) -> MaterializeResult:
    """Load movies CSV from MinIO to PostgreSQL using dlt."""

    context.log.info("Starting movies pipeline...")

    # Read movies CSV using dlt filesystem readers
    context.log.info("Reading movies.csv from MinIO...")
    movies_data = dlt.read_csv_from_s3(bucket="movie-lens", file_glob="movies.csv")

    # Run dlt pipeline
    context.log.info("Loading data to PostgreSQL...")
    result = dlt.run_pipeline(
        movies_data, table_name="movies", write_disposition="replace"
    )

    context.log.info(f"Movies pipeline completed: {result}")

    return MaterializeResult(
        metadata={
            "load_id": MetadataValue.text(str(result.get("load_id", ""))),
            "table_name": MetadataValue.text(result["table_name"]),
            "pipeline_name": MetadataValue.text(result["pipeline_name"]),
            "destination": MetadataValue.text(result["destination"]),
            "dataset_name": MetadataValue.text(result["dataset_name"]),
            "write_disposition": MetadataValue.text(
                result.get("write_disposition", "")
            ),
            "completed_jobs": MetadataValue.int(result.get("completed_jobs", 0)),
        }
    )


@asset(group_name="ratings")
def ratings_pipeline(
    context: AssetExecutionContext, dlt: DltResource
) -> MaterializeResult:
    """Load ratings CSV from MinIO to PostgreSQL using dlt."""

    # Read ratings CSV using dlt filesystem readers
    ratings_data = dlt.read_csv_from_s3(bucket="movie-lens", file_glob="ratings.csv")

    # Run dlt pipeline
    result = dlt.run_pipeline(
        ratings_data, table_name="ratings", write_disposition="replace"
    )

    context.log.info(f"Ratings pipeline completed: {result}")

    return MaterializeResult(
        metadata={
            "load_id": MetadataValue.text(str(result.get("load_id", ""))),
            "table_name": MetadataValue.text(result["table_name"]),
            "pipeline_name": MetadataValue.text(result["pipeline_name"]),
            "destination": MetadataValue.text(result["destination"]),
            "dataset_name": MetadataValue.text(result["dataset_name"]),
            "write_disposition": MetadataValue.text(
                result.get("write_disposition", "")
            ),
            "completed_jobs": MetadataValue.int(result.get("completed_jobs", 0)),
        }
    )


@asset(group_name="tags")
def tags_pipeline(
    context: AssetExecutionContext, dlt: DltResource
) -> MaterializeResult:
    """Load tags CSV from MinIO to PostgreSQL using dlt."""

    # Read tags CSV using dlt filesystem readers
    tags_data = dlt.read_csv_from_s3(bucket="movie-lens", file_glob="tags.csv")

    # Run dlt pipeline
    result = dlt.run_pipeline(tags_data, table_name="tags", write_disposition="replace")

    context.log.info(f"Tags pipeline completed: {result}")

    return MaterializeResult(
        metadata={
            "load_id": MetadataValue.text(str(result.get("load_id", ""))),
            "table_name": MetadataValue.text(result["table_name"]),
            "pipeline_name": MetadataValue.text(result["pipeline_name"]),
            "destination": MetadataValue.text(result["destination"]),
            "dataset_name": MetadataValue.text(result["dataset_name"]),
            "write_disposition": MetadataValue.text(
                result.get("write_disposition", "")
            ),
            "completed_jobs": MetadataValue.int(result.get("completed_jobs", 0)),
        }
    )


@asset(group_name="summary", deps=[movies_pipeline, ratings_pipeline, tags_pipeline])
def movielens_summary(
    context: AssetExecutionContext, dlt: DltResource
) -> MaterializeResult:
    """Generate summary of all loaded MovieLens data."""

    # Get pipeline to access dlt info
    pipeline = dlt.create_pipeline()

    # Get schema info
    schema = pipeline.default_schema
    tables = list(schema.tables.keys())

    context.log.info(f"MovieLens dataset loaded with tables: {tables}")

    # Calculate basic metrics
    table_count = len([t for t in tables if t in ["movies", "ratings", "tags"]])

    return MaterializeResult(
        metadata={
            "pipeline_name": MetadataValue.text(dlt.pipeline_name),
            "dataset_name": MetadataValue.text(dlt.dataset_name),
            "destination": MetadataValue.text(dlt.destination),
            "schema_version": MetadataValue.int(schema.version if schema else 0),
            "tables": MetadataValue.json(tables),
            "movielens_tables": MetadataValue.int(table_count),
        }
    )
