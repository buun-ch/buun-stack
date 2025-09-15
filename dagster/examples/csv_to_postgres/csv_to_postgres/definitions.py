from dagster import Definitions, load_assets_from_modules

from csv_to_postgres import assets  # noqa: TID252
from csv_to_postgres.resources import DltResource

all_assets = load_assets_from_modules([assets])

defs = Definitions(
    assets=all_assets,
    resources={
        "dlt": DltResource(),
    },
)
