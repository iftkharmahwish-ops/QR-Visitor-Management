const API_BASE_URL = 'http://localhost:8001/api';
const WS_BASE_URL = 'ws://localhost:8001/ws';

class ApiService {
  getToken() {
    return localStorage.getItem('auth_token') || '';
  }

  setToken(token) {
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const token = this.getToken();
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  async login(username, password) {
    const response = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    this.setToken(response.token);
    localStorage.setItem('auth_user', JSON.stringify(response.user));
    return response;
  }

  async getCurrentUser() {
    return this.request('/auth/me');
  }

  logout() {
    this.setToken('');
    localStorage.removeItem('auth_user');
  }

  // Visitor registration
  async registerVisitor(visitorData) {
    return this.request('/visitors/register', {
      method: 'POST',
      body: JSON.stringify({
        full_name: visitorData.fullName,
        phone: visitorData.phone,
        email: visitorData.email,
        company: visitorData.company,
        purpose: visitorData.purpose,
        employee_to_meet: visitorData.employee,
        branch: visitorData.branch,
        visit_date: visitorData.visitDate,
      }),
    });
  }

  // Get all visitors
  async getVisitors() {
    const response = await this.request('/visitors');
    return response.items || [];
  }

  // Get visitor by ID
  async getVisitor(visitorId) {
    return this.request(`/visitors/${visitorId}`);
  }

  // Get visitor QR code
  async getVisitorQR(visitorId) {
    const response = await fetch(`${API_BASE_URL}/visitors/${visitorId}/qr`);
    if (!response.ok) {
      throw new Error(`Failed to fetch QR code: ${response.status}`);
    }
    return response.blob();
  }

  // Check in visitor
  async checkInVisitor(visitorId, gateName = 'Main Gate') {
    return this.request('/security/checkin', {
      method: 'POST',
      body: JSON.stringify({
        visitor_id: visitorId,
        gate_name: gateName,
      }),
    });
  }

  // Check out visitor
  async checkOutVisitor(visitorId) {
    return this.request('/security/checkout', {
      method: 'POST',
      body: JSON.stringify({
        visitor_id: visitorId,
      }),
    });
  }

  // Get dashboard data
  async getDashboardData() {
    return this.request('/dashboard/live-stats');
  }

  // Face authentication
  async authenticateFace(visitorId, liveFaceToken) {
    return this.request('/ai/face-auth', {
      method: 'POST',
      body: JSON.stringify({
        visitor_id: visitorId,
        live_face_token: liveFaceToken,
      }),
    });
  }

  // Get suspicious patterns
  async getSuspiciousPatterns() {
    return this.request('/ai/suspicious-patterns');
  }

  // Health check
  async healthCheck() {
    return this.request('/health');
  }

  createDashboardSocket() {
    const token = this.getToken();
    return new WebSocket(`${WS_BASE_URL}/dashboard?token=${encodeURIComponent(token)}`);
  }
}

export const apiService = new ApiService();
