vault {
  address = "{{ .Env.VAULT_ADDR }}"
}

# Enable detailed logging
log_level = "{{ .Env.VAULT_AGENT_LOG_LEVEL }}"
log_format = "standard"

auto_auth {
  method "kubernetes" {
    mount_path = "auth/kubernetes"
    config = {
      role = "jupyterhub"
    }
  }

  sink "file" {
    config = {
      path = "/vault/secrets/vault-token"
    }
  }
}

cache {
  use_auto_auth_token = true
}

listener "tcp" {
  address     = "127.0.0.1:8100"
  tls_disable = true
}

# Add template for token monitoring
template {
  source      = "/vault/config/token-monitor.tpl"
  destination = "/vault/secrets/token-info.log"
  perms       = 0644
}