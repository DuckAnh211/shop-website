# Shop Website

Express + MongoDB Atlas + Cloudinary shop website, organized into service boundaries and ready for automated AWS deployment.

## Stack

- Express 5
- MongoDB Atlas with Mongoose
- Cloudinary for image storage
- Static frontend in `public/`
- Dockerized production runtime
- GitHub Actions deployment to AWS App Runner through Amazon ECR

## Architecture

The app runs as one deployable unit today, but the code is split by microservice-ready boundaries:

- `src/gateway/` - Express gateway, shared middleware, static frontend serving
- `src/services/auth/` - admin login and token issuing
- `src/services/catalog/` - product model, catalog API, admin product API, validation and query logic
- `src/services/media/` - upload middleware and Cloudinary image lifecycle
- `src/shared/` - environment, MongoDB connection, auth middleware, async/error helpers

Current API compatibility is preserved:

- `GET /products`
- `GET /products/meta/categories`
- `GET /products/:identifier`
- `POST /admin/login`
- `GET /admin/products`
- `POST /admin/add-product`
- `PUT /admin/products/:id`
- `DELETE /admin/products/:id`

## Local setup

1. Copy `.env.example` to `.env`
2. Fill in MongoDB Atlas, Cloudinary, admin credentials, and JWT secret
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run locally:
   ```bash
   npm run dev
   ```
5. Open `http://localhost:3000`

## Checks

Run a lightweight syntax check before pushing:

```bash
npm run check
```

## Environment variables

- `MONGODB_URI`
- `JWT_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_FOLDER` (optional)
- `CORS_ORIGIN` (optional)

## AWS Deployment

This repo includes automated deployment with GitHub Actions:

- Build Docker image
- Push image to Amazon ECR
- Start deployment on AWS App Runner

Fast path after you are logged in to AWS and GitHub locally:

```powershell
Copy-Item .env.example .env
# Fill .env with production MongoDB, Cloudinary, and admin values first.
.\scripts\aws-bootstrap-apprunner.ps1 -Region ap-southeast-1
git add .
git commit -m "Prepare AWS App Runner deployment"
git push origin main
```

The bootstrap script creates or updates:

- Amazon ECR repository
- Initial Docker image tagged `latest`
- App Runner ECR access role
- App Runner service
- GitHub OIDC provider and deploy role
- GitHub Actions secrets and variables

Manual equivalent if you do not use the bootstrap script:

1. Create an ECR repository, for example `shop-website`.
2. Push an initial `latest` image to that repository once, so App Runner can be created from it.
3. Create an AWS App Runner service from the ECR image `shop-website:latest` with an App Runner ECR access role.
4. Add the app environment variables from `.env.example` to the App Runner service.
5. Set App Runner health check path to `/health`.
6. Create a GitHub OIDC IAM role for deployment.
7. Add GitHub repository secrets and variables below.

GitHub repository secrets:

- `AWS_ROLE_TO_ASSUME` - IAM role ARN used by GitHub Actions
- `APP_RUNNER_SERVICE_ARN` - App Runner service ARN

GitHub repository variables:

- `AWS_REGION` - for example `ap-southeast-1`
- `ECR_REPOSITORY` - for example `shop-website`

Minimum permissions for the GitHub deployment role:

- `ecr:GetAuthorizationToken`
- `ecr:DescribeRepositories`
- `ecr:CreateRepository`
- `ecr:BatchCheckLayerAvailability`
- `ecr:InitiateLayerUpload`
- `ecr:UploadLayerPart`
- `ecr:CompleteLayerUpload`
- `ecr:PutImage`
- `apprunner:StartDeployment`

After this setup, every push to `main` deploys automatically. You can also run the workflow manually from GitHub Actions.
Keep app runtime secrets in App Runner environment variables; the GitHub workflow only needs deployment permissions.

## Docker

Build and run locally with Docker:

```bash
docker build -t shop-website .
docker run --env-file .env -p 3000:3000 shop-website
```

## Notes

- Product images now live on Cloudinary instead of local disk
- Admin routes require a JWT token returned from `/admin/login`
- Frontend stores the admin token in `localStorage`
- Products support category, tags, stock, published/draft status, featured status, search, filters, and sorting
- `/health` is a lightweight liveness check, while `/ready` verifies MongoDB connectivity
