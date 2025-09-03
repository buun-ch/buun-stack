"""
Quickstart example for buunstack SecretStore
"""

import json

from buunstack import SecretStore, get_env_from_secrets, put_env_to_secrets


def quickstart_example():
    """Basic example of using SecretStore"""
    print("🚀 buunstack QuickStart Example")
    print("=" * 40)

    # Initialize SecretStore (JupyterHub sync enabled by default)
    secrets = SecretStore()
    print(f"✅ SecretStore initialized for user: {secrets.username}")

    # Save some API keys (values must be strings)
    print("\n📝 Saving API keys...")
    secrets.put(
        "api-keys",
        openai_key="sk-example-key-here",
        github_token="ghp_example-token",
        database_url="postgresql://user:pass@localhost:5432/mydb",
    )
    print("   Put 3 API keys")

    # Get them back
    print("\n📖 Getting API keys...")
    loaded_keys = secrets.get("api-keys")
    if loaded_keys and isinstance(loaded_keys, dict):
        print(f"   Got {len(loaded_keys)} keys:")
        for key in loaded_keys.keys():
            print(f"     - {key}")

    # Get specific field directly
    print("\n🔑 Getting specific field...")
    openai_key = secrets.get("api-keys", field="openai_key")
    if openai_key and isinstance(openai_key, str):
        print(f"   OpenAI key: {openai_key[:10]}...")

    # Put environment variables
    print("\n🌍 Putting environment variables...")
    env_vars = {
        "PROJECT_NAME": "my-ml-project",
        "MODEL_VERSION": "v1.0.0",
        "DEBUG": "false",
    }
    put_env_to_secrets(secrets, env_vars)

    # Store complex data as JSON strings
    print("\n📦 Storing complex data as JSON...")
    config_data = {"batch_size": 32, "learning_rate": 0.001}
    model_layers = ["conv1", "pool1", "conv2", "pool2", "fc"]
    secrets.put(
        "ml-config",
        hyperparameters=json.dumps(config_data),
        architecture=json.dumps(model_layers),
        version="1.0.0",
    )
    print("   Stored ML configuration")

    # Get environment variables
    print("\n🔄 Getting environment variables...")
    loaded_vars = get_env_from_secrets(secrets)
    print(f"   Got {len(loaded_vars)} environment variables")

    # List all secrets
    print("\n📋 Listing all secrets...")
    all_secrets = secrets.list()
    print(f"   You have {len(all_secrets)} secrets:")
    for secret in all_secrets:
        print(f"     - {secret}")

    # Show status
    print("\n📊 SecretStore status:")
    status = secrets.get_status()
    for key, value in status.items():
        print(f"   {key}: {value}")

    print("\n🎉 Quickstart completed!")


def advanced_example():
    """Advanced example with different configurations"""
    print("\n🔧 Advanced Configuration Example")
    print("=" * 40)

    # Manual token management (disable JupyterHub sync)
    print("\n1️⃣ Manual token management:")
    manual_secrets = SecretStore(sync_with_jupyterhub=False)
    print(f"   JupyterHub sync: {manual_secrets.sync_with_jupyterhub}")

    # Custom timing
    print("\n2️⃣ Custom refresh timing:")
    custom_secrets = SecretStore(
        sync_with_jupyterhub=True,
        refresh_buffer_seconds=600,  # Sync 10 minutes before expiry
    )
    print(f"   Refresh buffer: {custom_secrets.refresh_buffer_seconds}s")
    print(f"   JupyterHub sync: {custom_secrets.sync_with_jupyterhub}")

    # Check JupyterHub API configuration
    print("\n3️⃣ JupyterHub API configuration:")
    status = custom_secrets.get_status()
    api_configured = status.get('jupyterhub_api_configured', False)
    print(f"   API configured: {api_configured}")
    if api_configured:
        print(f"   API URL: {custom_secrets.jupyterhub_api_url}")
    else:
        print("   API token or URL not configured")


if __name__ == "__main__":
    try:
        quickstart_example()
        advanced_example()
    except Exception as e:
        print(f"❌ Error: {e}")
        print(
            "Make sure you're running this in a JupyterHub environment with Vault integration enabled."
        )
