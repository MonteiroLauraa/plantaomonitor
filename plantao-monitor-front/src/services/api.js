import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:8000', // Adjust if your backend port is different
});

export default api;
