// Helper function to get API base URL
export const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    return process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname}:5178`;
  }
  return process.env.REACT_APP_API_URL || 'http://localhost:5178';
};