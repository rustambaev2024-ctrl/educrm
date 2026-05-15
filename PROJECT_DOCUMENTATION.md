# EduCRM Project Documentation

## Overview
EduCRM is a comprehensive educational management system built with Django (backend) and React (frontend) using TanStack Router. The system is designed as a multi-tenant application for educational institutions.

## Project Structure

### Backend (Django)
- **Location**: `backend/`
- **Framework**: Django with PostgreSQL
- **Key Features**:
  - Multi-tenancy support using `django_tenants`
  - JWT authentication
  - REST API with Django REST Framework
  - Real-time features with Django Channels
  - Background tasks with Celery
  - File storage with MinIO (S3-compatible)

#### Backend Apps
- **Core Apps**:
  - `accounts`: User management
  - `tenants`: Multi-tenancy support
  - `institutions`: Educational institution management
  - `staff`: Staff management
  - `students`: Student management
  - `courses`: Course management
  - `lessons`: Lesson scheduling
  - `finance`: Financial management
  - `homework`: Homework assignments
  - `grades`: Grading system
  - `chat`: Messaging system
  - `audit`: Audit logging
  - `notifications`: Notification system
  - `reports`: Reporting functionality

#### Backend Configuration
- **Database**: PostgreSQL with multi-tenancy
- **Authentication**: JWT with refresh tokens
- **Storage**: MinIO for file storage
- **Real-time**: Redis + Django Channels
- **Task Queue**: Celery with Redis broker

### Frontend (React)
- **Location**: `src/`
- **Framework**: React 19 with TypeScript
- **Router**: TanStack Router
- **UI**: Radix UI components with Tailwind CSS
- **State Management**: React Query
- **Forms**: React Hook Form with Zod validation

#### Frontend Structure
- **Components**:
  - `ui/`: Radix UI components
  - `edu/`: Education-specific components
  - `layouts/`: Layout components
- **Routes**:
  - `admin/`: Admin dashboard
  - `director/`: Director interface
  - `teacher/`: Teacher interface
  - `student/`: Student interface
  - `parent/`: Parent interface
  - `superadmin/`: Super admin interface
- **Libraries**:
  - API client
  - Authentication
  - Real-time updates
  - Internationalization
  - Utility functions

### Infrastructure
- **Containerization**: Docker with multiple services
- **Deployment**: Docker Compose for local development
- **Environment**: Multiple environment configurations (dev, prod, test)
- **CI/CD**: Pre-commit hooks, linting, formatting

## Key Technologies

### Backend Stack
- Python 3.x
- Django 4.x
- Django REST Framework
- PostgreSQL
- Redis
- Celery
- Django Channels
- MinIO

### Frontend Stack
- React 19
- TypeScript
- TanStack Router
- React Query
- Radix UI
- Tailwind CSS
- Zod
- Vite

### DevOps
- Docker
- Docker Compose
- Pre-commit
- ESLint
- Prettier
- Flake8

## Multi-tenancy Architecture
The system uses `django_tenants` for multi-tenancy:
- Shared schema for tenant management
- Separate schemas for each educational institution
- Tenant identification via domain or header
- Automatic schema switching

## Authentication Flow
1. JWT-based authentication
2. Access tokens: 60 minutes lifetime
3. Refresh tokens: 30 days lifetime
4. Token rotation and blacklisting
5. Role-based access control

## Real-time Features
- WebSocket connections via Django Channels
- Redis as message broker
- Real-time notifications
- Chat functionality
- Live updates

## File Storage
- MinIO as S3-compatible storage
- File uploads for documents, images, etc.
- Configurable bucket and endpoint

## Development Setup
1. Copy `.env.example` to `.env.development`
2. Configure database and Redis connections
3. Run `docker-compose up` for full stack
4. Frontend: `npm run dev`
5. Backend: `python manage.py runserver`

## Production Deployment
- Dockerized environment
- Separate configurations for production
- Environment variables for sensitive data
- Static files collection
- Database migrations

## Important Notes
- Language: Russian (LANGUAGE_CODE = "ru")
- Timezone: Asia/Tashkent (configurable)
- Database: PostgreSQL required for multi-tenancy
- Storage: MinIO or any S3-compatible storage

## System Architecture

### Multi-tenancy Flow
1. **Tenant Identification**: Via domain or `X-Tenant-Schema` header
2. **Schema Switching**: Automatic schema switching based on tenant
3. **Data Isolation**: Each tenant has separate database schema
4. **Shared Services**: Some services (auth, superadmin) are shared

### Authentication Flow
1. User logs in with phone/password → `/auth/token/`
2. Backend validates credentials and determines tenant
3. Returns JWT tokens (access + refresh) and user profile
4. Frontend stores tokens in localStorage
5. Subsequent requests include `Authorization: Bearer <token>`
6. Access token expires in 60 minutes, refresh token in 30 days
7. Automatic token refresh when access token expires

### API Structure
- **Base URL**: Configured via `VITE_API_BASE_URL`
- **Tenant Header**: `X-Tenant-Schema` for multi-tenancy
- **Authentication**: JWT Bearer tokens
- **Endpoints**:
  - `/auth/*`: Authentication endpoints
  - `/students/*`: Student management
  - `/staff/*`: Staff management
  - `/courses/*`: Course management
  - `/lessons/*`: Lesson scheduling
  - `/payments/*`: Financial transactions
  - `/chats/*`: Messaging system
  - `/notifications/*`: Notifications
  - `/analytics/*`: Analytics and reporting
  - `/superadmin/*`: Super admin functions

### Data Model Relationships
- **User** (accounts.User) → One-to-one relationships with role-specific profiles
  - Student → Student profile
  - Teacher → Staff profile
  - Parent → Parent profile
  - Admin → Staff profile
- **Institution** → Multiple Branches
- **Branch** → Multiple Students, Staff, Courses
- **Course** → Multiple Groups → Multiple Students
- **Student** → Multiple Parents (via ParentStudentLink)
- **Student** → Multiple Documents, Certificates, Payments
- **Lesson** → Multiple Attendance records
- **Homework** → Multiple Submissions

### Frontend-Backend Communication
1. **API Client**: Centralized in `src/lib/api.ts`
2. **Request Handling**:
   - Automatic token refresh on 401 errors
   - Tenant schema header injection
   - Error handling with custom `ApiError` class
3. **CRUD Operations**: Generic `crudApi` factory for standard operations
4. **Specialized APIs**: Role-specific API clients (studentApi, parentApi, etc.)

### Real-time Architecture
1. **WebSocket Connection**: Via Django Channels
2. **Message Broker**: Redis
3. **Real-time Features**:
   - Chat messages
   - Notifications
   - Live updates (attendance, grades, etc.)
4. **Connection Management**: Automatic reconnection

### File Storage Architecture
1. **Provider**: MinIO (S3-compatible)
2. **Upload Flow**:
   - Frontend → FormData → Backend API
   - Backend → MinIO storage
   - Returns file URL
3. **File Types**:
   - Student documents (contracts, passports, etc.)
   - Certificates
   - Avatars
   - Other attachments

## Development Workflow

### Frontend Development
1. **Environment Setup**:
   ```bash
   cd grow-class-co-main
   npm install
   cp .env.example .env.development
   ```
2. **Run Development Server**:
   ```bash
   npm run dev
   ```
3. **Build for Production**:
   ```bash
   npm run build
   ```

### Backend Development
1. **Environment Setup**:
   ```bash
   cd grow-class-co-main/backend
   python -m venv venv
   source venv/bin/activate  # or venv\Scripts\activate on Windows
   pip install -r requirements/development.txt
   ```
2. **Database Setup**:
   ```bash
   python manage.py migrate
   ```
3. **Run Development Server**:
   ```bash
   python manage.py runserver
   ```

### Docker Development
1. **Build and Run**:
   ```bash
   docker-compose -f docker-compose.local-run.yml up
   ```
2. **Services**:
   - Frontend: http://localhost:3000
   - Backend: http://localhost:8000
   - PostgreSQL: localhost:5432
   - Redis: localhost:6379
   - MinIO: localhost:9000

## Deployment Architecture

### Production Setup
1. **Containerized Deployment**: Docker + Docker Compose
2. **Services**:
   - Frontend: Vite-built static files served via Nginx
   - Backend: Gunicorn + Django
   - ASGI: Daphne for WebSocket support
   - Celery: Background task worker
   - PostgreSQL: Primary database
   - Redis: Cache, message broker, Celery broker
   - MinIO: File storage

### Scaling Considerations
1. **Horizontal Scaling**: Multiple backend workers
2. **Database**: Read replicas for reporting
3. **Cache**: Redis cluster for high availability
4. **Storage**: MinIO distributed mode

## Key Business Processes

### Student Lifecycle
1. **Lead Creation**: Potential student contact
2. **Lead Conversion**: Trial lesson → Enrollment
3. **Student Registration**: Full profile creation
4. **Course Assignment**: Enroll in courses/groups
5. **Attendance Tracking**: Lesson participation
6. **Grade Management**: Performance tracking
7. **Certification**: Course completion certificates
8. **Status Changes**: Active → Graduate/Archived

### Financial Workflow
1. **Wallet Management**: Student balance tracking
2. **Payment Processing**: Tuition payments
3. **Debt Management**: Overdue payment tracking
4. **Salary Calculation**: Staff compensation
5. **Financial Reporting**: Revenue analytics

### Communication Flow
1. **Parent-Student-Teacher**: Direct messaging
2. **System Notifications**: Important updates
3. **Announcements**: Broadcast messages
4. **Document Sharing**: Contracts, certificates

## Security Considerations

### Authentication Security
- JWT token rotation
- Refresh token blacklisting
- Secure token storage
- Automatic session expiration

### Data Security
- Role-based access control
- Tenant data isolation
- Secure file storage
- Audit logging

### API Security
- CSRF protection
- CORS configuration
- Input validation
- Rate limiting

## Performance Optimization

### Frontend
- Code splitting with Vite
- Lazy loading of routes
- React Query caching
- Optimized bundle size

### Backend
- Database indexing
- Query optimization
- Caching with Redis
- Background processing with Celery

### Network
- Compression
- CDN for static assets
- Efficient API design

## Monitoring and Maintenance

### Logging
- Comprehensive audit logging
- Error tracking
- Performance monitoring

### Backup Strategy
- Database backups
- File storage backups
- Configuration backups

### Update Process
- Zero-downtime deployments
- Database migration strategy
- Rollback procedures

## Future Enhancement Areas

1. **Mobile Applications**: Native mobile apps
2. **Advanced Analytics**: Machine learning insights
3. **Integration APIs**: Third-party system integration
4. **Automated Workflows**: AI-powered processes
5. **Internationalization**: Multi-language support
6. **Accessibility**: WCAG compliance
7. **Performance**: Further optimization
8. **Security**: Enhanced protection measures
