// Handles user sign-in and role-based navigation

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../config/supabaseClient';


export default function SignIn({ onSwitchToRegister }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleSignIn = async () => {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Failed to fetch user.");
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.role) {
      setError("User role not found.");
      return;
    }

    // Navigate based on role
    if (profile.role === 'super') {
      navigate('/super-dashboard');
    } else {
      navigate('/editor');
      // Fetch pending complaints against the user
      const { data: complaints } = await supabase
      .from('complaints')
      .select('id, reason')
      .eq('complained_id', user.id)
      .eq('status', 'pending');

      if (complaints && complaints.length > 0) {
      localStorage.setItem('pendingComplaint', JSON.stringify(complaints[0]));
      }
    }
  };

  
  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-4">Sign In</h2>
      <input
        type="email"
        placeholder="Email"
        className="border p-2 w-full mb-2"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Password"
        className="border p-2 w-full mb-2"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <p className="text-red-500">{error}</p>}
      <button
        className="bg-blue-500 text-white px-4 py-2 mb-2"
        onClick={handleSignIn}
      >
        Sign In
      </button>
      <p className="text-sm">
        Don't have an account?{' '}
        <button className="text-green-500 underline" onClick={onSwitchToRegister}>
          Register
        </button>
      </p>
    </div>
  );
}
