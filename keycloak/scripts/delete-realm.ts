import KcAdminClient from "@keycloak/keycloak-admin-client";
import invariant from "tiny-invariant";

const main = async () => {
  const keycloakHost = process.env.KEYCLOAK_HOST;
  invariant(keycloakHost, "KEYCLOAK_HOST environment variable is required.");

  const adminUsername = process.env.KEYCLOAK_ADMIN_USER;
  invariant(adminUsername, "KEYCLOAK_ADMIN_USER environment variable is required.");

  const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD;
  invariant(adminPassword, "KEYCLOAK_ADMIN_PASSWORD environment variable is required");

  const realmNameToDelete = process.env.KEYCLOAK_REALM_TO_DELETE;
  invariant(realmNameToDelete, "KEYCLOAK_REALM_TO_DELETE environment variable is required");

  if (realmNameToDelete === "master") {
    console.error(
      "Error: Deleting the 'master' realm is a highly destructive operation and is not allowed by this script."
    );
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }

  const kcAdminClient = new KcAdminClient({
    baseUrl: `https://${keycloakHost}`,
    realmName: "master", // Authenticate against master realm to delete other realms
  });

  try {
    await kcAdminClient.auth({
      username: adminUsername,
      password: adminPassword,
      grantType: "password",
      clientId: "admin-cli",
    });
    console.log("Authentication successful with master realm.");

    // Check if realm exists before attempting deletion
    const realm = await kcAdminClient.realms.findOne({ realm: realmNameToDelete });

    if (!realm) {
      console.warn(`Realm '${realmNameToDelete}' not found. Nothing to delete.`);
      return; // Exit gracefully if realm doesn't exist
    }

    console.log(`Attempting to delete realm: '${realmNameToDelete}'...`);
    await kcAdminClient.realms.del({ realm: realmNameToDelete });
    console.log(`Realm '${realmNameToDelete}' deleted successfully.`);
  } catch (error) {
    console.error(`An error occurred while trying to delete realm '${realmNameToDelete}':`, error);
    const err = error as any;
    if (err.response?.data) {
      console.error("Error details:", JSON.stringify(err.response.data, undefined, 2));
    }
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }
};

main();
