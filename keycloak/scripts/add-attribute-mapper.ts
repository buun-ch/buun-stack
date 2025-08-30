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

  const clientId = process.env.CLIENT_ID;
  invariant(clientId, "CLIENT_ID environment variable is required");

  const attributeName = process.env.ATTRIBUTE_NAME;
  invariant(attributeName, "ATTRIBUTE_NAME environment variable is required");

  const attributeDisplayName = process.env.ATTRIBUTE_DISPLAY_NAME || attributeName;
  const attributeClaimName = process.env.ATTRIBUTE_CLAIM_NAME || attributeName;
  const attributeOptions = process.env.ATTRIBUTE_OPTIONS?.split(",");
  const attributeDefaultValue = process.env.ATTRIBUTE_DEFAULT_VALUE;
  const mapperName = process.env.MAPPER_NAME || `${attributeDisplayName} Mapper`;

  // Parse permissions from environment variables
  const viewPermissions = process.env.ATTRIBUTE_VIEW_PERMISSIONS?.split(",") || ["admin", "user"];
  const editPermissions = process.env.ATTRIBUTE_EDIT_PERMISSIONS?.split(",") || ["admin"];

  const includeInUserInfo = process.env.INCLUDE_IN_USERINFO !== "false";
  const includeInIdToken = process.env.INCLUDE_IN_ID_TOKEN !== "false";
  const includeInAccessToken = process.env.INCLUDE_IN_ACCESS_TOKEN !== "false";

  console.log(`Setting ${attributeName} attribute`);
  if (attributeDefaultValue) {
    console.log(`Default value: ${attributeDefaultValue}`);
  }
  if (attributeOptions) {
    console.log(`Valid options: ${attributeOptions.join(", ")}`);
  }
  console.log(`View permissions: ${viewPermissions.join(", ")}`);
  console.log(`Edit permissions: ${editPermissions.join(", ")}`);

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

    // Set realm to work with
    kcAdminClient.setConfig({
      realmName,
    });

    // Get current User Profile configuration
    const userProfile = await kcAdminClient.users.getProfile();

    // Check if attribute already exists
    const existingAttribute = userProfile.attributes?.find(
      (attr: any) => attr.name === attributeName
    );

    if (existingAttribute) {
      console.log(`${attributeName} attribute already exists in User Profile.`);
    } else {
      // Add attribute to User Profile with proper permissions
      if (!userProfile.attributes) {
        userProfile.attributes = [];
      }

      const attributeConfig: any = {
        name: attributeName,
        displayName: attributeDisplayName,
        permissions: {
          view: viewPermissions,
          edit: editPermissions,
        },
      };

      // Add validations if options are provided
      if (attributeOptions && attributeOptions.length > 0) {
        attributeConfig.validations = {
          options: { options: attributeOptions },
        };
      }

      userProfile.attributes.push(attributeConfig);

      // Update User Profile
      await kcAdminClient.users.updateProfile(userProfile);
      console.log(
        `${attributeName} attribute added to User Profile successfully with admin edit permissions.`
      );
    }

    // Create protocol mapper for the attribute if it doesn't exist
    const client = await kcAdminClient.clients.find({ clientId });
    if (client.length === 0) {
      console.error(`Client '${clientId}' not found.`);
      // eslint-disable-next-line unicorn/no-process-exit
      process.exit(1);
    }
    const clientInternalId = client[0].id;
    invariant(clientInternalId, "Client internal ID is required");

    // Check if the mapper already exists
    const mappers = await kcAdminClient.clients.listProtocolMappers({ id: clientInternalId });
    const existingMapper = mappers.find((mapper) => mapper.name === mapperName);

    if (existingMapper) {
      console.log(`${mapperName} already exists.`);
    } else {
      // Create the protocol mapper
      await kcAdminClient.clients.addProtocolMapper(
        { id: clientInternalId },
        {
          name: mapperName,
          protocol: "openid-connect",
          protocolMapper: "oidc-usermodel-attribute-mapper",
          config: {
            "userinfo.token.claim": includeInUserInfo.toString(),
            "id.token.claim": includeInIdToken.toString(),
            "access.token.claim": includeInAccessToken.toString(),
            "claim.name": attributeClaimName,
            "jsonType.label": "String",
            "user.attribute": attributeName,
            multivalued: "false",
          },
        }
      );
      console.log(`${mapperName} created successfully.`);
    }

    // Set default value for all existing users if specified
    if (attributeDefaultValue) {
      const users = await kcAdminClient.users.find();
      for (const user of users) {
        if (!user.attributes?.[attributeName]) {
          await kcAdminClient.users.update(
            { id: user.id! },
            {
              ...user,
              attributes: {
                ...user.attributes,
                [attributeName]: [attributeDefaultValue],
              },
            }
          );
          console.log(`Set default ${attributeName} for user ${user.username}`);
        }
      }
    }
  } catch (error) {
    console.error("An error occurred:", error);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }
};

main();
