#!/bin/bash
# Restore only Superset datasets, charts, and dashboards from backup
#
# Usage:
#   ./restore-datasets-charts.sh [--charts-only]
#
# Options:
#   --charts-only    Restore only charts and datasets (skip dashboards)

set -euo pipefail

NAMESPACE="superset"
POSTGRES_NAMESPACE="postgres"
BACKUP_FILE="${BACKUP_FILE:-/var/lib/postgresql/data/superset-restore.sql}"
DB_NAME="superset"
DB_USER="postgres"  # Use superuser for restore

# Get PostgreSQL pod name
POD_NAME=$(kubectl get pods -n postgres -l cnpg.io/cluster=postgres-cluster \
    -o jsonpath='{.items[0].metadata.name}')

# Get database password from secret
DB_PASSWORD=$(kubectl get secret -n postgres postgres-cluster-superuser -o jsonpath='{.data.password}' | base64 -d)

# Core tables for datasets and charts
CORE_TABLES=(
    "tables"           # Dataset metadata
    "table_columns"    # Dataset columns
    "sql_metrics"      # Dataset metrics
    "slices"           # Chart definitions
)

# Dashboard tables (restored by default)
DASHBOARD_TABLES=(
    "dashboards"           # Dashboard metadata
    "dashboard_slices"     # Chart-Dashboard relationships
    "dashboard_user"       # Dashboard-User relationships
    "dashboard_roles"      # Dashboard-Role relationships
    "embedded_dashboards"  # Embedded dashboard configurations
)

# Parse command line arguments
RESTORE_DASHBOARDS=true  # Default: restore dashboards
for arg in "$@"; do
    case $arg in
        --charts-only)
            RESTORE_DASHBOARDS=false
            shift
            ;;
        *)
            echo "Unknown option: $arg"
            echo "Usage: $0 [--charts-only]"
            exit 1
            ;;
    esac
done

# Build table list
TABLES=("${CORE_TABLES[@]}")
if [ "$RESTORE_DASHBOARDS" = true ]; then
    TABLES+=("${DASHBOARD_TABLES[@]}")
fi

echo "Restoring the following tables in database '$DB_NAME':"
for table in "${TABLES[@]}"; do
    echo "  - $table"
done
echo ""

# Restore each table
for table in "${TABLES[@]}"; do
    echo "Restoring table: $table"

    # First, truncate the existing table (with CASCADE to handle foreign keys)
    kubectl exec -n "$POSTGRES_NAMESPACE" "$POD_NAME" -- \
        bash -c "PGPASSWORD='$DB_PASSWORD' psql -h localhost -U $DB_USER -d $DB_NAME -c 'TRUNCATE TABLE $table CASCADE;'" || {
        echo "Warning: Failed to truncate $table (table might not exist yet)"
    }

    # Disable foreign key constraints temporarily
    kubectl exec -n "$POSTGRES_NAMESPACE" "$POD_NAME" -- \
        bash -c "PGPASSWORD='$DB_PASSWORD' psql -h localhost -U $DB_USER -d $DB_NAME -c 'ALTER TABLE $table DISABLE TRIGGER ALL;'" || {
        echo "Warning: Failed to disable triggers on $table"
    }

    # Restore the table data (without --disable-triggers as we're managing it manually)
    kubectl exec -n "$POSTGRES_NAMESPACE" "$POD_NAME" -- \
        bash -c "PGPASSWORD='$DB_PASSWORD' pg_restore -h localhost -U $DB_USER -d $DB_NAME \
        --table=$table \
        --data-only \
        $BACKUP_FILE" || {
        echo "Error: Failed to restore $table"
        exit 1
    }

    # Re-enable foreign key constraints
    kubectl exec -n "$POSTGRES_NAMESPACE" "$POD_NAME" -- \
        bash -c "PGPASSWORD='$DB_PASSWORD' psql -h localhost -U $DB_USER -d $DB_NAME -c 'ALTER TABLE $table ENABLE TRIGGER ALL;'" || {
        echo "Warning: Failed to enable triggers on $table"
    }

    echo "  ✓ Successfully restored $table"
done

echo ""
echo "Restoration completed successfully!"
echo ""
echo "Restored tables:"
for table in "${TABLES[@]}"; do
    count=$(kubectl exec -n "$POSTGRES_NAMESPACE" "$POD_NAME" -- \
        bash -c "PGPASSWORD='$DB_PASSWORD' psql -h localhost -U $DB_USER -d $DB_NAME -tAc 'SELECT COUNT(*) FROM $table;'")
    echo "  - $table: $count rows"
done
