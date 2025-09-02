# InsightDocs Frontend

A modern Next.js frontend application for document collaboration, user management, and role-based access control with Keycloak authentication.

## Features

### 🔑 User Registration & Authentication
- **Automatic User Creation**: When a new user registers, the system automatically creates:
  - User account
  - Client account
  - Organization
  - Assigns Owner role

### 👥 User Login & Dashboard
- **Seamless Authentication**: Keycloak integration for secure login
- **Dashboard Overview**: Shows user's organizations, clients, and roles
- **Real-time Updates**: Live data synchronization

### 🏢 Organization Management
- **Organization Creation**: Automatic organization creation for new users
- **Role Assignment**: Owner and Reviewer roles with different permissions
- **Member Management**: Invite and manage organization members

### 🛡️ Role-Based Access Control
- **Owner Capabilities**:
  - Create & manage organizations
  - Create & manage clients
  - Invite new users
  - Assign/reassign roles
  - Remove members

- **Reviewer Capabilities**:
  - Access assigned organizations/clients
  - View and review documents
  - Provide feedback/comments
  - Cannot invite users or modify roles

### 🚪 Global Logout
- **Session Management**: Logout terminates all active sessions
- **Security**: Proper token cleanup and session invalidation

## Tech Stack

- **Framework**: Next.js 15.5.2 with App Router
- **Styling**: Tailwind CSS
- **Authentication**: Keycloak
- **HTTP Client**: Axios
- **Icons**: Heroicons
- **UI Components**: Headless UI

## Project Structure

```
frontend/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── dashboard/          # Dashboard page
│   │   ├── globals.css         # Global styles
│   │   ├── layout.js           # Root layout
│   │   └── page.js             # Landing page
│   ├── components/             # React components
│   │   ├── Layout.js           # Main layout wrapper
│   │   ├── Navbar.js           # Navigation bar
│   │   └── ProtectedLayout.js  # Protected route wrapper
│   ├── contexts/               # React contexts
│   │   └── AuthContext.js      # Authentication context
│   └── lib/                    # Utility libraries
│       ├── api.js              # API configuration
│       └── keycloak.js         # Keycloak configuration
├── next.config.js              # Next.js configuration
└── package.json                # Dependencies
```

## Getting Started

### Prerequisites

1. **Node.js** (v18 or higher)
2. **Keycloak Server** running on `http://localhost:8080`
3. **Backend API** running on `http://localhost:3001`

### Installation

1. **Install dependencies**:
   ```bash
   cd frontend
   npm install
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```

3. **Open your browser** and navigate to `http://localhost:3000`

### Environment Variables

Create a `.env.local` file in the frontend directory:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Keycloak Configuration

The application expects the following Keycloak setup:

- **Realm**: `framesync`
- **Client ID**: `framesync-client-public`
- **Client Type**: Public
- **Valid Redirect URIs**: `http://localhost:3000/*`

## API Endpoints

The frontend communicates with the backend API for:

- **User Management**: `/users`
- **Organization Management**: `/organizations`
- **Authentication**: `/auth/logout-all`

## User Workflow

### 1. User Registration
1. User clicks "Get Started" on landing page
2. Redirected to Keycloak login/registration
3. After successful registration:
   - User account created in database
   - Organization automatically created
   - Client automatically created
   - User assigned Owner role

### 2. User Login
1. User logs in with credentials
2. Dashboard displays:
   - User's organizations
   - User's clients
   - User's roles

### 3. Organization Management
1. **Owners** can invite new members
2. **Owners** can assign roles (Owner/Reviewer)
3. **Reviewers** can access documents and provide feedback

### 4. Role Permissions
- **Owner**: Full access to manage organization, clients, and roles
- **Reviewer**: Limited access for analysis and review only

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Code Style

- **Components**: Functional components with hooks
- **Styling**: Tailwind CSS utility classes
- **State Management**: React Context API
- **Routing**: Next.js App Router

## Security Features

- **Token Management**: Automatic token refresh
- **Session Security**: Global logout functionality
- **Route Protection**: Protected routes for authenticated users
- **API Security**: Token-based API authentication

## Contributing

1. Follow the existing code style
2. Use TypeScript for new components
3. Add proper error handling
4. Test authentication flows
5. Update documentation as needed

## License

This project is part of the InsightDocs platform.
