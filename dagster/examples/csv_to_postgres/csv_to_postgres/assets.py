from dagster import AssetExecutionContext, MaterializeResult, MetadataValue, asset

from .resources import DltResource


@asset(group_name="movies")
def movies_pipeline(
    context: AssetExecutionContext, dlt: DltResource
) -> MaterializeResult:
    """Load movies CSV from MinIO to PostgreSQL using dlt."""

    context.log.info("Starting movies pipeline...")

    # Check if table already exists and has data
    table_exists = dlt.table_exists_and_has_data("movies")
    if table_exists:
        context.log.info("Movies table already exists with data, skipping import")
        return MaterializeResult(
            metadata={
                "status": MetadataValue.text("skipped"),
                "reason": MetadataValue.text("table already exists with data"),
            }
        )

    # Read movies CSV using dlt filesystem readers
    context.log.info("Reading movies.csv from MinIO...")
    movies_data = dlt.read_csv_from_s3(bucket="movie-lens", file_glob="movies.csv")

    # Set primary key for movies table
    movies_data.apply_hints(primary_key="movieId")

    result = dlt.run_pipeline(
        movies_data,
        table_name="movies",
        write_disposition="replace",
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

    # Check if table already exists and has data
    if dlt.table_exists_and_has_data("ratings"):
        context.log.info("Ratings table already exists with data, skipping import")
        return MaterializeResult(
            metadata={
                "status": MetadataValue.text("skipped"),
                "reason": MetadataValue.text("table already exists with data"),
            }
        )

    # Read ratings CSV using dlt filesystem readers
    ratings_data = dlt.read_csv_from_s3(bucket="movie-lens", file_glob="ratings.csv")

    # Set composite primary key for ratings table
    ratings_data.apply_hints(primary_key=["userId", "movieId"])

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

    # Check if table already exists and has data
    if dlt.table_exists_and_has_data("tags"):
        context.log.info("Tags table already exists with data, skipping import")
        return MaterializeResult(
            metadata={
                "status": MetadataValue.text("skipped"),
                "reason": MetadataValue.text("table already exists with data"),
            }
        )

    # Read tags CSV using dlt filesystem readers
    tags_data = dlt.read_csv_from_s3(bucket="movie-lens", file_glob="tags.csv")

    # Set composite primary key for tags table
    tags_data.apply_hints(primary_key=["userId", "movieId", "timestamp"])

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

    context.log.info("Generating summary of MovieLens dataset...")

    # Try to get schema from one of the existing pipelines
    pipeline_names = ["movies", "ratings", "tags"]
    schema_info = {}
    tables_found = []

    for table_name in pipeline_names:
        try:
            # Create pipeline with the same name used in previous assets
            pipeline = dlt.create_pipeline(table_name=table_name)

            # Try to get schema if it exists
            if pipeline.default_schema_name in pipeline.schemas:
                schema = pipeline.schemas[pipeline.default_schema_name]
                context.log.info(
                    f"Found schema for pipeline '{pipeline.pipeline_name}'"
                )
                schema_info[table_name] = {
                    "pipeline": pipeline.pipeline_name,
                    "schema_version": schema.version,
                }
                tables_found.extend(
                    [t for t in schema.tables.keys() if t == table_name]
                )
        except Exception as e:
            context.log.debug(f"Could not get schema for {table_name}: {e}")

    context.log.info(
        f"Summary: Found {len(tables_found)} tables from {len(schema_info)} pipelines"
    )

    return MaterializeResult(
        metadata={
            "base_pipeline_name": MetadataValue.text(dlt.pipeline_name),
            "dataset_name": MetadataValue.text(dlt.dataset_name),
            "destination": MetadataValue.text(dlt.destination),
            "pipelines_checked": MetadataValue.json(list(schema_info.keys())),
            "tables_found": MetadataValue.json(tables_found),
            "movielens_tables_count": MetadataValue.int(len(tables_found)),
            "schema_info": MetadataValue.json(schema_info),
        }
    )
