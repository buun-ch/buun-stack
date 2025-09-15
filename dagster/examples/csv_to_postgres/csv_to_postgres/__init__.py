from dagster import Definitions

from .assets import movies_pipeline, ratings_pipeline, tags_pipeline, movielens_summary
from .resources import DltResource

defs = Definitions(
    assets=[
        movies_pipeline,
        ratings_pipeline,
        tags_pipeline,
        movielens_summary,
    ],
    resources={
        "dlt": DltResource(
            minio_access_key="minio",
            minio_secret_key="minio123",
        ),
    },
)