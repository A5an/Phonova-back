# Step 1: Use an official Node.js runtime as a parent image
FROM node:20-alpine

RUN apk add --no-cache openssl

# Step 2: Set the working directory inside the container
WORKDIR /app/phonova

# Step 3: Install dependencies
COPY package*.json ./
# Step 4: Install dependencies
RUN npm install

# Step 5: Copy the rest of the application code
COPY . .

# Step 5: Build the application
RUN npm run build

# Step 6: Expose the port the app runs on
# 3000 Production
# 3001 Stage
# 3002 Sockets
# 3003 Whatsapp Service
EXPOSE 3000

# Step 7: Define the command to run the app
CMD ["node", "--max-old-space-size=10240", "--dns-result-order=ipv4first", "dist/index.js"]