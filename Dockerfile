# Use official Node.js image
# Node 18's OpenSSL/TLS stack has a well-documented incompatibility with
# MongoDB Atlas's TLS termination (MongoServerSelectionError: "SSL routines:
# ssl3_read_bytes:tlsv1 alert internal error" during the handshake, not an
# auth or network issue). Node 20+ resolves it.
FROM node:20

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Expose port used by the app
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
