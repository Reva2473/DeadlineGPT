FROM node:20

WORKDIR /app

# Copy backend package and install
COPY backend/package*.json ./backend/
RUN cd backend && npm install

# Copy frontend package and install
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

# Copy all source code
COPY . .

# Build frontend
RUN cd frontend && npm run build

# Expose backend port
EXPOSE 8080

# Run the backend server
WORKDIR /app/backend
CMD ["node", "server.js"]
