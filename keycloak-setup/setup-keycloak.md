# Keycloak Setup for InsightDocs

## Step 1: Start Keycloak with Docker

```bash
cd keycloak-setup
docker-compose up -d
```

Wait for Keycloak to start (about 30-60 seconds).

## Step 2: Access Keycloak Admin Console

1. Open your browser and go to: `http://localhost:8080`
2. Click on "Administration Console"
3. Login with:
   - Username: `admin`
   - Password: `admin`

## Step 3: Create Realm

1. In the top-left dropdown, click "Create Realm"
2. Enter:
   - Realm name: `framesync`
   - Click "Create"

## Step 4: Create Client

1. In the left sidebar, click "Clients"
2. Click "Create client"
3. Fill in:
   - Client ID: `framesync-client-public`
   - Client Protocol: `openid-connect`
   - Click "Save"

## Step 5: Configure Client Settings

1. In the client settings, go to "Settings" tab
2. Set:
   - Access Type: `public`
   - Valid Redirect URIs: `http://localhost:3000/*`
   - Web Origins: `http://localhost:3000`
   - Click "Save"

## Step 6: Create User (Optional)

1. In the left sidebar, click "Users"
2. Click "Add user"
3. Fill in:
   - Username: `testuser`
   - Email: `test@example.com`
   - First Name: `Test`
   - Last Name: `User`
   - Click "Save"

4. Go to "Credentials" tab:
   - Set password: `password123`
   - Turn off "Temporary"
   - Click "Save"

## Step 7: Test the Application

1. Go back to your InsightDocs application: `http://localhost:3000`
2. Click "Get Started"
3. You should now be redirected to Keycloak login
4. Login with the user you created

## Troubleshooting

- If Keycloak doesn't start, check Docker logs: `docker-compose logs keycloak`
- If you can't access Keycloak, make sure port 8080 is not in use
- For production, change default passwords and use HTTPS
