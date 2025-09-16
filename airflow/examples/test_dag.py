from datetime import datetime, timedelta
from airflow import DAG
from airflow.providers.standard.operators.python import PythonOperator

def test_task(**context):
    print("Test task executed successfully!")
    return "success"

default_args = {
    "owner": "test",
    "depends_on_past": False,
    "start_date": datetime(2024, 1, 1),
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 1,
    "retry_delay": timedelta(minutes=5),
}

dag = DAG(
    "test_dag",
    default_args=default_args,
    description="Simple test DAG",
    schedule=None,
    catchup=False,
    tags=["test"],
)

test_task = PythonOperator(
    task_id="test_task",
    python_callable=test_task,
    dag=dag,
)