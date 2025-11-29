import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      const token = searchParams.get('token');
      const error = searchParams.get('error');

      if (error) {
        console.error('OAuth error:', error);
        navigate('/auth?error=' + error);
        return;
      }

      if (token) {
        try {
          // Store the token
          localStorage.setItem('authToken', token);

          // Fetch user profile
          const response = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/auth/profile`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (response.ok) {
            const data = await response.json();
            localStorage.setItem('authUser', JSON.stringify(data.data.user));
            navigate('/Dashboard');
          } else {
            throw new Error('Failed to fetch profile');
          }
        } catch (error) {
          console.error('Auth callback error:', error);
          navigate('/auth?error=profile_fetch_failed');
        }
      } else {
        navigate('/auth?error=no_token');
      }
    };

    handleCallback();
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
        <p className="text-gray-600">Completing sign in...</p>
      </div>
    </div>
  );
}