# Shop Website

Express + MongoDB Atlas + Amazon S3 shop website, organized into service boundaries and ready for automated AWS deployment.

## Stack

- Express 5
- MongoDB Atlas with Mongoose
- Amazon S3 for product image storage
- Static frontend in `public/`
- Dockerized production runtime
- GitHub Actions deployment to AWS EC2 through Amazon ECR and SSM

## Architecture

The app runs as one deployable unit today, but the code is split by microservice-ready boundaries:

- `src/gateway/` - Express gateway, shared middleware, static frontend serving
- `src/services/auth/` - admin login and token issuing
- `src/services/catalog/` - product model, catalog API, admin product API, validation and query logic
- `src/services/media/` - upload middleware and S3 image lifecycle
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
2. Fill in MongoDB Atlas, S3, admin credentials, and JWT secret
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
- `SITE_URL` (public website URL used for sitemap, robots.txt, and product canonical links)
- `JWT_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `AWS_REGION`
- `AWS_S3_BUCKET`
- `AWS_S3_KEY_PREFIX` (optional)
- `AWS_S3_PUBLIC_BASE_URL` (optional, use this for CloudFront/custom domains)
- `CORS_ORIGIN` (optional)

## AWS Deployment

This repo includes automated deployment with GitHub Actions:

- Build Docker image
- Push image to Amazon ECR
- Deploy the container on AWS EC2 through AWS Systems Manager

Fast path after you are logged in to AWS and GitHub locally:

```powershell
Copy-Item .env.example .env
# Fill .env with production MongoDB, S3, and admin values first.
.\scripts\aws-bootstrap-ec2.ps1 -Region ap-southeast-1
git add .
git commit -m "Prepare AWS EC2 deployment"
git push origin main
```

The bootstrap script creates or updates:

- Amazon ECR repository
- Amazon S3 bucket for product images
- Initial Docker image tagged `latest`
- EC2 IAM instance profile with SSM, ECR pull, and S3 image permissions
- EC2 security group with public HTTP on port 80
- EC2 instance running Docker
- GitHub OIDC provider and deploy role
- GitHub Actions secrets and variables

Manual equivalent if you do not use the bootstrap script:

1. Create an ECR repository, for example `shop-website`.
2. Create an S3 bucket for product images and allow public read for product image objects.
3. Push an initial `latest` image to that repository.
4. Create an EC2 IAM instance profile with `AmazonSSMManagedInstanceCore`, ECR pull access, and S3 image permissions.
5. Launch an Amazon Linux 2023 EC2 instance in a public subnet and attach the instance profile.
6. Allow inbound TCP port 80 on the EC2 security group.
7. Install Docker on the instance and run the app with `--env-file /opt/shop-website/.env -p 80:3000`.
8. Create a GitHub OIDC IAM role for deployment.
9. Add GitHub repository secrets and variables below.

GitHub repository secrets:

- `AWS_ROLE_TO_ASSUME` - IAM role ARN used by GitHub Actions

GitHub repository variables:

- `AWS_REGION` - for example `ap-southeast-1`
- `ECR_REPOSITORY` - for example `shop-website`
- `EC2_INSTANCE_ID` - target instance for SSM deployment

Minimum permissions for the GitHub deployment role:

- `ecr:GetAuthorizationToken`
- `ecr:DescribeRepositories`
- `ecr:CreateRepository`
- `ecr:BatchCheckLayerAvailability`
- `ecr:InitiateLayerUpload`
- `ecr:UploadLayerPart`
- `ecr:CompleteLayerUpload`
- `ecr:PutImage`
- `ssm:SendCommand`
- `ssm:GetCommandInvocation`
- `ssm:ListCommandInvocations`
- `ec2:DescribeInstances`

After this setup, every push to `main` deploys automatically. You can also run the workflow manually from GitHub Actions.
Keep app runtime secrets in `/opt/shop-website/.env` on EC2; the GitHub workflow only needs deployment permissions.

## Docker

Build and run locally with Docker:

```bash
docker build -t shop-website .
docker run --env-file .env -p 3000:3000 shop-website
```

## Notes

- Product images now live on Amazon S3 instead of local disk
- Admin routes require a JWT token returned from `/admin/login`
- Frontend stores the admin token in `localStorage`
- Products support category, tags, stock, published/draft status, featured status, search, filters, and sorting
- `/health` is a lightweight liveness check, while `/ready` verifies MongoDB connectivity
