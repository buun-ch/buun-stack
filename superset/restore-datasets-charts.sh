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
echo "Fixing orphaned user references..."

# Fix orphaned foreign key references to ab_user
kubectl exec -n "$POSTGRES_NAMESPACE" "$POD_NAME" -- \
    bash -c "PGPASSWORD='$DB_PASSWORD' psql -h localhost -U $DB_USER -d $DB_NAME" <<'EOF'
BEGIN;

-- Temporarily disable triggers to allow updates
SET session_replication_role = replica;

-- Fix all orphaned references to ab_user (replace with user_id = 1)
UPDATE dashboards SET created_by_fk = 1 WHERE created_by_fk NOT IN (SELECT id FROM ab_user);
UPDATE dashboards SET changed_by_fk = 1 WHERE changed_by_fk NOT IN (SELECT id FROM ab_user);

UPDATE tables SET created_by_fk = 1 WHERE created_by_fk NOT IN (SELECT id FROM ab_user);
UPDATE tables SET changed_by_fk = 1 WHERE changed_by_fk NOT IN (SELECT id FROM ab_user);

UPDATE slices SET created_by_fk = 1 WHERE created_by_fk NOT IN (SELECT id FROM ab_user);
UPDATE slices SET changed_by_fk = 1 WHERE changed_by_fk NOT IN (SELECT id FROM ab_user);
UPDATE slices SET last_saved_by_fk = 1 WHERE last_saved_by_fk NOT IN (SELECT id FROM ab_user);

UPDATE sql_metrics SET created_by_fk = 1 WHERE created_by_fk NOT IN (SELECT id FROM ab_user);
UPDATE sql_metrics SET changed_by_fk = 1 WHERE changed_by_fk NOT IN (SELECT id FROM ab_user);

UPDATE table_columns SET created_by_fk = 1 WHERE created_by_fk NOT IN (SELECT id FROM ab_user);
UPDATE table_columns SET changed_by_fk = 1 WHERE changed_by_fk NOT IN (SELECT id FROM ab_user);

-- Re-enable triggers
SET session_replication_role = DEFAULT;

COMMIT;
EOF

echo "  ✓ Successfully fixed orphaned user references"

echo ""
echo "Fixing PostgreSQL sequences..."

# Fix all sequences to prevent primary key conflicts
kubectl exec -n "$POSTGRES_NAMESPACE" "$POD_NAME" -- \
    bash -c "PGPASSWORD='$DB_PASSWORD' psql -h localhost -U $DB_USER -d $DB_NAME" <<'EOF'
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT s.relname AS seq_name, t.relname AS table_name
        FROM pg_class AS s
        JOIN pg_depend AS d ON d.objid = s.oid
        JOIN pg_class AS t ON d.refobjid = t.oid
        WHERE s.relkind = 'S'
          AND t.relkind = 'r'
          AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    LOOP
        EXECUTE format('SELECT setval(%L, (SELECT COALESCE(MAX(id), 0) + 1 FROM %I))', r.seq_name, r.table_name);
        RAISE NOTICE 'Fixed sequence % for table %', r.seq_name, r.table_name;
    END LOOP;
END $$;
EOF

echo "  ✓ Successfully fixed all sequences"

echo ""
echo "Restoration completed successfully!"
echo ""
echo "Restored tables:"
for table in "${TABLES[@]}"; do
    count=$(kubectl exec -n "$POSTGRES_NAMESPACE" "$POD_NAME" -- \
        bash -c "PGPASSWORD='$DB_PASSWORD' psql -h localhost -U $DB_USER -d $DB_NAME -tAc 'SELECT COUNT(*) FROM $table;'")
    echo "  - $table: $count rows"
done
