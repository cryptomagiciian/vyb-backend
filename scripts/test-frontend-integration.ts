import axios from 'axios';
import { io, Socket } from 'socket.io-client';

const API_BASE_URL = process.env.API_URL || 'http://localhost:8080';
const WS_URL = process.env.WS_URL || 'http://localhost:8080';

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL';
  message: string;
  duration: number;
}

class FrontendIntegrationTester {
  private results: TestResult[] = [];
  private authToken: string | null = null;
  private socket: Socket | null = null;

  async runAllTests(): Promise<void> {
    console.log('🧪 Starting Frontend Integration Tests...\n');

    await this.testHealthCheck();
    await this.testAuthentication();
    await this.testFeedEndpoints();
    await this.testSwipeEndpoints();
    await this.testUserEndpoints();
    await this.testWebSocketConnection();
    await this.testErrorHandling();

    this.printResults();
  }

  private async testHealthCheck(): Promise<void> {
    const start = Date.now();
    try {
      const response = await axios.get(`${API_BASE_URL}/health`);
      const duration = Date.now() - start;
      
      if (response.status === 200 && response.data.status === 'ok') {
        this.addResult('Health Check', 'PASS', 'API is healthy', duration);
      } else {
        this.addResult('Health Check', 'FAIL', 'API returned unexpected response', duration);
      }
    } catch (error) {
      this.addResult('Health Check', 'FAIL', `API is not responding: ${error.message}`, Date.now() - start);
    }
  }

  private async testAuthentication(): Promise<void> {
    const start = Date.now();
    try {
      // Test magic link request
      const magicLinkResponse = await axios.post(`${API_BASE_URL}/auth/magic-link`, {
        email: 'test@example.com'
      });
      
      if (magicLinkResponse.status === 200 && magicLinkResponse.data.success) {
        this.addResult('Magic Link Request', 'PASS', 'Magic link request successful', Date.now() - start);
      } else {
        this.addResult('Magic Link Request', 'FAIL', 'Magic link request failed', Date.now() - start);
      }

      // Test wallet challenge
      const walletResponse = await axios.post(`${API_BASE_URL}/auth/wallet/challenge`, {
        wallet: '0x1234567890123456789012345678901234567890'
      });
      
      if (walletResponse.status === 200 && walletResponse.data.message) {
        this.addResult('Wallet Challenge', 'PASS', 'Wallet challenge generated', Date.now() - start);
      } else {
        this.addResult('Wallet Challenge', 'FAIL', 'Wallet challenge failed', Date.now() - start);
      }

    } catch (error) {
      this.addResult('Authentication', 'FAIL', `Authentication test failed: ${error.message}`, Date.now() - start);
    }
  }

  private async testFeedEndpoints(): Promise<void> {
    if (!this.authToken) {
      this.addResult('Feed Endpoints', 'SKIP', 'No auth token available', 0);
      return;
    }

    const start = Date.now();
    try {
      const headers = { Authorization: `Bearer ${this.authToken}` };
      
      // Test feed endpoint
      const feedResponse = await axios.get(`${API_BASE_URL}/feed/next?limit=5`, { headers });
      
      if (feedResponse.status === 200 && feedResponse.data.success) {
        this.addResult('Feed Endpoint', 'PASS', `Retrieved ${feedResponse.data.items?.length || 0} markets`, Date.now() - start);
      } else {
        this.addResult('Feed Endpoint', 'FAIL', 'Feed endpoint failed', Date.now() - start);
      }

      // Test feed stats
      const statsResponse = await axios.get(`${API_BASE_URL}/feed/stats`, { headers });
      
      if (statsResponse.status === 200 && statsResponse.data.success) {
        this.addResult('Feed Stats', 'PASS', 'Feed stats retrieved', Date.now() - start);
      } else {
        this.addResult('Feed Stats', 'FAIL', 'Feed stats failed', Date.now() - start);
      }

    } catch (error) {
      this.addResult('Feed Endpoints', 'FAIL', `Feed test failed: ${error.message}`, Date.now() - start);
    }
  }

  private async testSwipeEndpoints(): Promise<void> {
    if (!this.authToken) {
      this.addResult('Swipe Endpoints', 'SKIP', 'No auth token available', 0);
      return;
    }

    const start = Date.now();
    try {
      const headers = { Authorization: `Bearer ${this.authToken}` };
      
      // Test swipe recording
      const swipeResponse = await axios.post(`${API_BASE_URL}/swipe`, {
        marketId: 'test-market-id',
        direction: 'RIGHT',
        idempotencyKey: `test-${Date.now()}`
      }, { headers });
      
      if (swipeResponse.status === 200 && swipeResponse.data.success) {
        this.addResult('Swipe Recording', 'PASS', 'Swipe recorded successfully', Date.now() - start);
      } else {
        this.addResult('Swipe Recording', 'FAIL', 'Swipe recording failed', Date.now() - start);
      }

      // Test swipe history
      const historyResponse = await axios.get(`${API_BASE_URL}/swipe/history?limit=10`, { headers });
      
      if (historyResponse.status === 200 && historyResponse.data.success) {
        this.addResult('Swipe History', 'PASS', 'Swipe history retrieved', Date.now() - start);
      } else {
        this.addResult('Swipe History', 'FAIL', 'Swipe history failed', Date.now() - start);
      }

    } catch (error) {
      this.addResult('Swipe Endpoints', 'FAIL', `Swipe test failed: ${error.message}`, Date.now() - start);
    }
  }

  private async testUserEndpoints(): Promise<void> {
    if (!this.authToken) {
      this.addResult('User Endpoints', 'SKIP', 'No auth token available', 0);
      return;
    }

    const start = Date.now();
    try {
      const headers = { Authorization: `Bearer ${this.authToken}` };
      
      // Test user profile
      const profileResponse = await axios.get(`${API_BASE_URL}/user/profile`, { headers });
      
      if (profileResponse.status === 200 && profileResponse.data.success) {
        this.addResult('User Profile', 'PASS', 'User profile retrieved', Date.now() - start);
      } else {
        this.addResult('User Profile', 'FAIL', 'User profile failed', Date.now() - start);
      }

      // Test user stats
      const statsResponse = await axios.get(`${API_BASE_URL}/user/stats`, { headers });
      
      if (statsResponse.status === 200 && statsResponse.data.success) {
        this.addResult('User Stats', 'PASS', 'User stats retrieved', Date.now() - start);
      } else {
        this.addResult('User Stats', 'FAIL', 'User stats failed', Date.now() - start);
      }

    } catch (error) {
      this.addResult('User Endpoints', 'FAIL', `User test failed: ${error.message}`, Date.now() - start);
    }
  }

  private async testWebSocketConnection(): Promise<void> {
    const start = Date.now();
    return new Promise((resolve) => {
      try {
        this.socket = io(`${WS_URL}/realtime`, {
          auth: { token: this.authToken || 'test-token' },
          timeout: 5000,
        });

        this.socket.on('connect', () => {
          this.addResult('WebSocket Connection', 'PASS', 'Connected to realtime gateway', Date.now() - start);
          this.socket?.disconnect();
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          this.addResult('WebSocket Connection', 'FAIL', `Connection failed: ${error.message}`, Date.now() - start);
          resolve();
        });

        setTimeout(() => {
          this.addResult('WebSocket Connection', 'FAIL', 'Connection timeout', Date.now() - start);
          resolve();
        }, 5000);

      } catch (error) {
        this.addResult('WebSocket Connection', 'FAIL', `WebSocket test failed: ${error.message}`, Date.now() - start);
        resolve();
      }
    });
  }

  private async testErrorHandling(): Promise<void> {
    const start = Date.now();
    try {
      // Test 404 endpoint
      try {
        await axios.get(`${API_BASE_URL}/nonexistent-endpoint`);
        this.addResult('Error Handling', 'FAIL', 'Should have returned 404', Date.now() - start);
      } catch (error) {
        if (error.response?.status === 404) {
          this.addResult('Error Handling', 'PASS', '404 error handled correctly', Date.now() - start);
        } else {
          this.addResult('Error Handling', 'FAIL', `Unexpected error: ${error.message}`, Date.now() - start);
        }
      }

      // Test unauthorized access
      try {
        await axios.get(`${API_BASE_URL}/feed/next`);
        this.addResult('Auth Protection', 'FAIL', 'Should have returned 401', Date.now() - start);
      } catch (error) {
        if (error.response?.status === 401) {
          this.addResult('Auth Protection', 'PASS', '401 error handled correctly', Date.now() - start);
        } else {
          this.addResult('Auth Protection', 'FAIL', `Unexpected error: ${error.message}`, Date.now() - start);
        }
      }

    } catch (error) {
      this.addResult('Error Handling', 'FAIL', `Error handling test failed: ${error.message}`, Date.now() - start);
    }
  }

  private addResult(test: string, status: 'PASS' | 'FAIL' | 'SKIP', message: string, duration: number): void {
    this.results.push({ test, status, message, duration });
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️';
    console.log(`${icon} ${test}: ${message} (${duration}ms)`);
  }

  private printResults(): void {
    console.log('\n📊 Test Results Summary:');
    console.log('========================');
    
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const skipped = this.results.filter(r => r.status === 'SKIP').length;
    
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏭️ Skipped: ${skipped}`);
    console.log(`📈 Total: ${this.results.length}`);
    
    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.filter(r => r.status === 'FAIL').forEach(result => {
        console.log(`   - ${result.test}: ${result.message}`);
      });
    }
    
    const avgDuration = this.results.reduce((sum, r) => sum + r.duration, 0) / this.results.length;
    console.log(`\n⏱️ Average Response Time: ${avgDuration.toFixed(2)}ms`);
    
    if (failed === 0) {
      console.log('\n🎉 All tests passed! Your backend is ready for frontend integration.');
    } else {
      console.log('\n⚠️ Some tests failed. Please check the issues above.');
    }
  }
}

// Run the tests
const tester = new FrontendIntegrationTester();
tester.runAllTests().catch(console.error);
