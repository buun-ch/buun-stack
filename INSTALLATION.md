# Installation Guide

This guide provides detailed instructions for setting up buun-stack - a Kubernetes development environment accessible from anywhere via the internet.

## Prerequisites

### Linux Machine

A Linux PC with the following requirements:

- Docker support
- SSH daemon configured for remote access
- Passwordless sudo execution (required for k3sup)
- Low power consumption recommended for 24/7 operation

### Cloud Services

- **Domain Registrar**: For registering and managing domain names
- **DNS Provider**: DNS managed by Cloudflare (for tunnel setup)
- **Container Registry**: For storing container images (optional)

### Local Development Machine

- Linux or macOS preferred
- [mise](https://mise.jdx.dev/) installed

## Setting Up the Linux Machine

### Basic Configuration

1. Install Linux with Docker support
2. Configure SSH daemon for remote access
3. Set up passwordless sudo execution

### Arch Linux Specific Configuration

For Arch Linux users, configure sshd to support keyboard-interactive authentication with PAM:

Create `/etc/ssh/sshd_config.d/10-pamauth.conf`:

```
KbdInteractiveAuthentication yes
AuthenticationMethods publickey keyboard-interactive:pam
```

Restart the sshd service:

```bash
sudo systemctl restart sshd
```

Create sudoers file for your account (replace `buun` with your username):

`/etc/sudoers.d/buun`:

```
buun ALL=(ALL:ALL) NOPASSWD: ALL
```

## Installing Required Tools

### Clone the Repository

```bash
git clone https://github.com/buun-ch/buun-stack
cd buun-stack
```

### Install mise

Follow the [Getting Started](https://mise.jdx.dev/getting-started.html) guide to install mise.

### Install Project Tools

```bash
mise install
mise ls -l  # Verify installed tools
```

This installs the following tools:

- **gomplate**: Template engine for configuration files
- **gum**: Interactive CLI for user input
- **helm**: Kubernetes package manager
- **just**: Task runner for installation commands
- **kubelogin**: kubectl authentication plugin
- **vault**: HashiCorp Vault CLI client

## Creating the Kubernetes Cluster

### Generate Configuration

```bash
just env::setup  # Creates .env.local with your configuration
```

This interactive command collects:

- SSH hostname for local access
- External domain names for services
- Keycloak realm name
- Other configuration options

### Deploy k3s Cluster

```bash
just k8s::install
kubectl get nodes  # Verify cluster status
```

The installation uses k3sup to deploy k3s on the remote machine and automatically configures kubeconfig on your local machine.

## Configuring Cloudflare Tunnel

### Create the Tunnel

1. Navigate to Cloudflare Dashboard > Zero Trust > Network > Tunnels
2. Click "+ Create a tunnel"
3. Select "Cloudflared"
4. Enter tunnel name
5. Click "Save tunnel"

### Install cloudflared

#### Debian/Red Hat

Follow the instructions displayed in the Cloudflare dashboard.

#### Arch Linux

```bash
paru cloudflared
```

Create the systemd unit file:

```bash
sudo systemctl edit --force --full cloudflared.service
```

Add the following content (replace `<TOKEN VALUE>` with your token):

```
[Unit]
Description=Cloudflare Tunnel
After=network.target

[Service]
TimeoutStartSec=0
Type=notify
ExecStart=/usr/bin/cloudflared tunnel --loglevel debug --logfile /var/log/cloudflared/cloudflared.log run --token <TOKEN VALUE>
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

### Configure Public Hostnames

In the Cloudflare tunnel configuration, add these public hostnames:

- `ssh.yourdomain.com` → SSH localhost:22
- `vault.yourdomain.com` → HTTPS localhost:443 (No TLS Verify)
- `auth.yourdomain.com` → HTTPS localhost:443 (No TLS Verify)
- `k8s.yourdomain.com` → HTTPS localhost:6443 (No TLS Verify)

**Note**: Enable "No TLS Verify" for HTTPS services as they use self-signed certificates internally.

### Configure SSH Access

#### macOS

Install cloudflared:

```bash
brew install cloudflared
```

Configure SSH in `~/.ssh/config`:

```
Host yourdomain
  Hostname ssh.yourdomain.com
  ProxyCommand /opt/homebrew/bin/cloudflared access ssh --hostname %h
```

Test connection:

```bash
ssh yourdomain
```

## Installing Core Components

### Longhorn - Distributed Storage

Longhorn provides distributed block storage with support for PersistentVolumes and NFS exports.

#### Prerequisites for Longhorn

Install open-iscsi on the Linux machine:

```bash
# Arch Linux
sudo pacman -S open-iscsi
sudo systemctl enable iscsid
sudo systemctl start iscsid

# Ubuntu/Debian
sudo apt-get install open-iscsi
sudo systemctl enable iscsid
sudo systemctl start iscsid
```

#### Install Longhorn

```bash
just longhorn::install
```

### HashiCorp Vault - Secrets Management

Vault provides centralized secrets management for the entire cluster.

```bash
just vault::install
```

**Important**: Store the displayed root token securely. You'll need it for initial configuration.

### PostgreSQL - Database Cluster

PostgreSQL provides database services for Keycloak and applications.

```bash
just postgres::install
```

### Keycloak - Identity Management

Keycloak provides identity and access management with OIDC/OAuth2 support.

```bash
just keycloak::install
```

## Configuring OIDC Authentication

### Create Keycloak Realm

```bash
just keycloak::create-realm
```

The default realm name is `buunstack`. To change it, edit `.env.local`:

```bash
KEYCLOAK_REALM=your-realm
```

### Configure Vault OIDC Integration

```bash
just vault::setup-oidc-auth
```

This enables Vault authentication via Keycloak OIDC.

### Create Initial User

```bash
just keycloak::create-user
```

Follow the prompts to create username and password.

### Enable Kubernetes OIDC Authentication

```bash
just k8s::setup-oidc-auth
```

This creates a new kubectl context with OIDC authentication. If your original context is `minipc1`, the OIDC context will be `minipc1-oidc`.

## Testing the Setup

### Verify OIDC Authentication

```bash
kubectl config use-context minipc1-oidc
kubectl get nodes
```

### Test Pod Operations

Create test resources:

```bash
kubectl apply -f debug/debug-pod.yaml
kubectl apply -f debug/debug-svc.yaml
```

Test kubectl exec:

```bash
kubectl exec debug-pod -it -- sh
# Inside the pod:
uname -a
ps x
exit
```

Test port forwarding:

```bash
kubectl port-forward svc/debug-service 8080:8080
# In another terminal:
curl localhost:8080
```

### Test Vault OIDC

```bash
export VAULT_ADDR=https://vault.yourdomain.com
vault login -method=oidc
vault kv get -mount=secret -field=password postgres/admin
```

## Troubleshooting

### Check Pod Logs

```bash
kubectl logs -n <namespace> <pod-name>
```

### Check Service Status

```bash
kubectl get pods -A
kubectl get svc -A
```

### Reset OIDC Configuration

If OIDC authentication fails:

1. Check Keycloak is running: `kubectl get pods -n keycloak`
2. Verify realm exists: Browse to `https://auth.yourdomain.com`
3. Re-run OIDC setup: `just k8s::setup-oidc-auth`

### Connection Issues

If unable to connect via Cloudflare Tunnel:

1. Check tunnel status in Cloudflare dashboard
2. Verify cloudflared service: `sudo systemctl status cloudflared`
3. Check DNS resolution: `nslookup k8s.yourdomain.com`

## Next Steps

- Create custom recipes in `custom.just` for your workflows
- Deploy applications using Helm charts
- Set up CI/CD pipelines
- Configure monitoring and observability

## Resources

- [GitHub Repository](https://github.com/buun-ch/buun-stack)
- [k3s Documentation](https://k3s.io)
- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [Video Tutorial](https://youtu.be/Ezv4dEjLeKo)
- [Dev.to Article](https://dev.to/buun-ch/building-a-remote-accessible-kubernetes-home-lab-with-k3s-5g05)
