from setuptools import find_packages, setup

setup(
    name="csv_to_postgres",
    packages=find_packages(exclude=["csv_to_postgres_tests"]),
    install_requires=[
        "dagster",
        "dagster-cloud"
    ],
    extras_require={"dev": ["dagster-webserver", "pytest"]},
)
