#!/usr/bin/env node

// This script is a wrapper for add-attribute-mapper.ts specifically for MinIO policy configuration
// It sets the appropriate environment variables and calls the generic script

import { spawn } from "node:child_process";
import invariant from "tiny-invariant";

const main = async () => {
  // Validate MinIO-specific environment variables
  const minioClientId = process.env.MINIO_OIDC_CLIENT_ID;
  invariant(minioClientId, "MINIO_OIDC_CLIENT_ID environment variable is required");

  const policyValue = process.env.MINIO_POLICY || "readwrite";
  console.log(`Setting MinIO policy attribute with default value: ${policyValue}`);

  // Set up environment variables for the generic script
  const env = {
    ...process.env,
    CLIENT_ID: minioClientId,
    ATTRIBUTE_NAME: "minioPolicy",
    ATTRIBUTE_DISPLAY_NAME: "MinIO Policy",
    ATTRIBUTE_CLAIM_NAME: "minioPolicy",
    ATTRIBUTE_OPTIONS: "readwrite,readonly,writeonly",
    ATTRIBUTE_DEFAULT_VALUE: policyValue,
    MAPPER_NAME: "MinIO Policy",
  };

  // Call the generic add-attribute-mapper script
  const child = spawn("npx", ["tsx", "../../keycloak/scripts/add-attribute-mapper.ts"], {
    cwd: __dirname,
    env,
    stdio: "inherit",
  });

  child.on("error", (error) => {
    console.error("Failed to execute add-attribute-mapper.ts:", error);
    process.exit(1);
  });

  child.on("exit", (code) => {
    process.exit(code || 0);
  });
};

main();
