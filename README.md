# Shop Website

Express + MongoDB Atlas + Cloudinary shop website, refactored for Vercel deployment.

## Stack

- Express 5
- MongoDB Atlas with Mongoose
- Cloudinary for image storage
- Static frontend in `public/`
- Vercel serverless function in `api/index.js`

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

## Deploy to Vercel

1. Push the project to GitHub
2. Import the repo into Vercel
3. Add the environment variables from `.env.example`
4. Deploy

## Notes

- Product images now live on Cloudinary instead of local disk
- Admin routes require a JWT token returned from `/admin/login`
- Frontend stores the admin token in `localStorage`
