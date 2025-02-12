# Production Deployment Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Infrastructure Setup](#infrastructure-setup)
3. [Docker Configuration](#docker-configuration)
4. [Continuous Integration/Deployment](#continuous-integrationdeployment)
5. [Zero-Downtime Deployment](#zero-downtime-deployment)
6. [SSL/HTTPS Setup](#sslhttps-setup)
7. [Monitoring](#monitoring)

## Prerequisites

### Local Machine Setup (Your MacBook)
- Git installed
- Node.js/npm installed
- SSH client (comes pre-installed on MacOS)
- Docker Desktop (optional, for local testing)

### Server Setup (Your VPS)
Update system and install essential tools, after your VPS is created.
```bash
apt update && apt upgrade -y
apt install -y \
    docker.io \
    docker-compose \
    nginx \
    certbot \
    python3-certbot-nginx
```

Note: The `pm2` installation is not needed as we'll be using Docker for process management in production.

// ... existing code ...

## Infrastructure Setup

### 1. VPS Setup (Digital Ocean)
- Create a Droplet (recommended: Ubuntu 22.04 LTS)
- Minimum 2GB RAM, 2 vCPUs
- Enable backups
- Add SSH key authentication




### 2. DNS Configuration

Add A records for your domain:
```
chat.yourdomain.com    A     <Your-Server-IPv4>
chat.yourdomain.com    AAAA  <Your-Server-IPv6>
api.yourdomain.com     A     <Your-Server-IPv4>
api.yourdomain.com     AAAA  <Your-Server-IPv6>
```

### Difference between IPv4 and IPv6

**IPv4 (Internet Protocol version 4)**:
- **Address Length**: IPv4 addresses are 32 bits long, typically represented in decimal format as four octets separated by periods (e.g., 192.168.1.1).
- **Address Space**: IPv4 provides approximately 4.3 billion unique addresses.
- **Header Complexity**: IPv4 headers are simpler and smaller, making them easier to process but less flexible.
- **Address Configuration**: IPv4 supports both manual and DHCP (Dynamic Host Configuration Protocol) address configuration.
- **NAT (Network Address Translation)**: Widely used in IPv4 to extend the address space by allowing multiple devices on a local network to share a single public IP address.
- **Security**: Security is optional and typically implemented through additional protocols like IPsec.

**IPv6 (Internet Protocol version 6)**:
- **Address Length**: IPv6 addresses are 128 bits long, typically represented in hexadecimal format as eight groups of four hexadecimal digits separated by colons (e.g., 2001:0db8:85a3:0000:0000:8a2e:0370:7334).
- **Address Space**: IPv6 provides a vastly larger address space, with approximately 340 undecillion (3.4 x 10^38) unique addresses.
- **Header Complexity**: IPv6 headers are more complex and larger, but they are designed to be more efficient and flexible.
- **Address Configuration**: IPv6 supports both stateless address autoconfiguration (SLAAC) and DHCPv6 for address configuration.
- **NAT**: Generally not needed in IPv6 due to the abundance of addresses, allowing for end-to-end connectivity.
- **Security**: IPv6 was designed with mandatory support for IPsec, providing built-in security features.

### Which to Setup

For most modern applications and deployments, it is recommended to set up **IPv6** due to its larger address space, improved efficiency, and built-in security features. However, **IPv4** is still widely used and supported, and you may need to configure both IPv4 and IPv6 to ensure compatibility with all devices and networks.

In our deployment, we will configure both IPv4 and IPv6 to ensure comprehensive connectivity and future-proofing of our infrastructure. This dual-stack approach allows our services to communicate over both protocols, providing flexibility and compatibility.

To configure both IPv4 and IPv6, ensure that your DNS records and server network settings support both address types. For example, you can add both A (IPv4) and AAAA (IPv6) records for your domain:


### SSH into Your VPS

Before proceeding with the following steps, ensure that you have SSH access to your VPS. You can SSH into your VPS using the following command:
```bash
ssh root@<Your-Server-IPv4>
```


## Docker Configuration

### 1. Create Docker Network
Create a dedicated Docker network to enable secure communication between containers.
This isolates our chat application services from other Docker containers on the host
and allows containers to reference each other by service name instead of IP addresses.
The network provides DNS resolution and encrypted communication between containers.

A Docker network is a virtual networking layer that allows containers to communicate with each other securely and in isolation. Key aspects include:

- **Container Isolation**: Each Docker network provides a separate namespace where containers can run isolated from other networks
- **DNS Resolution**: Containers on the same network can reference each other by service name instead of IP addresses
- **Network Types**:
  - `bridge`: Default network type for containers on same host
  - `host`: Container shares host's network stack
  - `overlay`: Enables communication between containers across multiple Docker hosts
  - `macvlan`: Assigns MAC address to container for direct network access
- **Security**: Networks create isolation boundaries and can restrict which containers can communicate
- **Service Discovery**: Automatic DNS resolution between containers in same network


```bash
docker network create chat-network
```


// ... existing code ...

### 2. Project Structure
Create two Dockerfiles in your project root:

```
project-root/
├── Dockerfile.server
├── Dockerfile.client
├── docker-compose.yml
├── src/
│   ├── client/
│   │   └── ...
│   └── server/
│       └── ...
```

### 3. Dockerfile.server
```dockerfile
FROM oven/bun:latest

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install

COPY ./src/server ./src/server
COPY ./shared ./shared  # If you have shared code

EXPOSE 3000

CMD ["bun", "run", "start:server"]
```

### 4. Dockerfile.client
```dockerfile
FROM node:18-alpine as builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install

COPY ./src/client ./src/client
COPY ./shared ./shared  # If you have shared code

RUN npm run build:client

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```


### 4. Docker Compose
```yaml
version: '3.8'

services:
  nginx-proxy:
    image: nginxproxy/nginx-proxy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/tmp/docker.sock:ro
      - certs:/etc/nginx/certs
      - vhost:/etc/nginx/vhost.d
      - html:/usr/share/html
    restart: always
    networks:
      - chat-network

  letsencrypt:
    image: nginxproxy/acme-companion
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - certs:/etc/nginx/certs
      - vhost:/etc/nginx/vhost.d
      - html:/usr/share/html
      - acme:/etc/acme.sh
    environment:
      - DEFAULT_EMAIL=your-email@domain.com
    depends_on:
      - nginx-proxy
    networks:
      - chat-network

  server:
    build: ./server
    expose:
      - "3000"
    environment:
      - VIRTUAL_HOST=api.yourdomain.com
      - LETSENCRYPT_HOST=api.yourdomain.com
    restart: always
    networks:
      - chat-network

  client:
    build: ./client
    expose:
      - "80"
    environment:
      - VIRTUAL_HOST=chat.yourdomain.com
      - LETSENCRYPT_HOST=chat.yourdomain.com
    restart: always
    networks:
      - chat-network

volumes:
  certs:
  vhost:
  html:
  acme:

networks:
  chat-network:
    external: true
```

## Continuous Integration/Deployment

### 1. GitHub Actions Workflow
Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Deploy to VPS
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.HOST }}
          username: ${{ secrets.USERNAME }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /opt/chat-app
            git pull origin main
            docker-compose pull
            docker-compose up -d --build
```

### 2. Server Setup Script
Create `setup.sh`:
```bash
#!/bin/bash

# Create application directory
mkdir -p /opt/chat-app
cd /opt/chat-app

# Clone repository
git clone https://github.com/yourusername/chat-app.git .

# Create environment files
touch .env

# Start services
docker-compose up -d
```

## Zero-Downtime Deployment

### 1. Nginx Configuration
Create `nginx.conf`:
```nginx
upstream backend {
    server server:3000;
}

server {
    listen 80;
    server_name chat.yourdomain.com;

    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 2. Health Check Endpoint
Add to server.ts:
```typescript
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});
```

## Monitoring

### 1. Prometheus & Grafana Configuration
Create `monitoring/docker-compose.yml`:
```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"
    networks:
      - chat-network

  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
    volumes:
      - grafana-storage:/var/lib/grafana
    networks:
      - chat-network

volumes:
  grafana-storage:
```

### 2. Prometheus Configuration
Create `prometheus.yml`:
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'chat-server'
    static_configs:
      - targets: ['server:3000']
```

## Deployment Steps

1. **Initial Server Setup**
```bash
# SSH into your server
ssh root@your-server-ip

# Run setup script
bash setup.sh
```

2. **Configure GitHub Secrets**
Add to your GitHub repository secrets:
- `HOST`: Your server IP
- `USERNAME`: Your server username
- `SSH_PRIVATE_KEY`: Your SSH private key

3. **First Deployment**
Push to main branch to trigger deployment:
```bash
git push origin main
```

4. **Verify Deployment**
- Check services: `docker-compose ps`
- View logs: `docker-compose logs -f`
- Test endpoints:
  - https://chat.yourdomain.com
  - https://api.yourdomain.com

## Maintenance

### Backup
```bash
# Backup volumes
docker run --rm -v chat-app_data:/data -v /backup:/backup ubuntu tar czf /backup/chat-backup-$(date +%Y%m%d).tar.gz /data
```

### Updates
```bash
# Update base images
docker-compose pull
docker-compose up -d
```

### Monitoring
- Access Grafana: http://your-server-ip:3000
- Default credentials: admin/admin
- Set up dashboard for:
  - Server CPU/Memory usage
  - WebSocket connections
  - Message throughput

## Troubleshooting

### Common Issues

1. **SSL Certificate Issues**
```bash
docker-compose logs letsencrypt
certbot --nginx -d chat.yourdomain.com -d api.yourdomain.com
```

2. **Container Restart**
```bash
docker-compose restart server
```

3. **Log Inspection**
```bash
docker-compose logs -f --tail=100 server
```

## Security Considerations

1. **Firewall Setup**
```bash
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 22/tcp
ufw enable
```

2. **Regular Updates**
```bash
apt update && apt upgrade -y
docker-compose pull
docker-compose up -d
```

3. **SSL Configuration**
- Enable HSTS
- Use strong SSL ciphers
- Regular certificate renewal (automated with Let's Encrypt)

## Performance Optimization

1. **Nginx Caching**
2. **WebSocket Connection Pooling**
3. **Docker Container Resource Limits**

Remember to replace:
- `yourdomain.com` with your actual domain
- `your-email@domain.com` with your email
- GitHub repository URLs with your actual repository URLs
``` 