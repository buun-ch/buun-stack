import KcAdminClient from "@keycloak/keycloak-admin-client";
import invariant from "tiny-invariant";

const main = async () => {
  const keycloakHost = process.env.KEYCLOAK_HOST;
  invariant(keycloakHost, "KEYCLOAK_HOST environment variable is required.");

  const adminUsername = process.env.KEYCLOAK_ADMIN_USER;
  invariant(adminUsername, "KEYCLOAK_ADMIN_USER environment variable is required.");

  const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD;
  invariant(adminPassword, "KEYCLOAK_ADMIN_PASSWORD environment variable is required");

  const realmName = process.env.KEYCLOAK_REALM;
  invariant(realmName, "KEYCLOAK_REALM environment variable is required");

  const usernameToDelete = process.env.USERNAME;
  invariant(
    usernameToDelete,
    "USERNAME environment variable (for the user to be deleted) is required"
  );

  const kcAdminClient = new KcAdminClient({
    baseUrl: `https://${keycloakHost}`,
    realmName: "master",
  });

  try {
    await kcAdminClient.auth({
      username: adminUsername,
      password: adminPassword,
      grantType: "password",
      clientId: "admin-cli",
    });
    console.log("Authentication successful.");

    kcAdminClient.setConfig({ realmName });

    const users = await kcAdminClient.users.find({ username: usernameToDelete });

    if (users.length === 0) {
      console.warn(`User '${usernameToDelete}' not found in realm '${realmName}'.`);
      return;
    }

    const user = users[0];
    invariant(user.id, `User ID not found for user '${usernameToDelete}'.`);

    await kcAdminClient.users.del({ id: user.id });
    console.log(
      `User '${usernameToDelete}' (ID: ${user.id}) successfully deleted from realm '${realmName}'.`
    );
  } catch (error) {
    console.error("An error occurred during user deletion:", error);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }
};

main();
