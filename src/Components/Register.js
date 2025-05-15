// Handles user registration
// and profile creation in the database.

import { useState } from 'react';
import supabase from '../config/supabaseClient';

export default function Register({ onSwitchToSignIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const handleRegister = async () => {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });
    
      if (error) {
        setError(error.message);
        return;
      }
      
      // Check if the user was created successfully
      if (data && data.user && data.user.id) {
        const { error: profileError } = await supabase.from('profiles').insert([
          { id: data.user.id, email: email, tokens: 100 } // Start with 100 tokens
        ]);
    
        if (profileError) {
          setError("Failed to create user profile.");
          return;
        }
    
        alert('Registration successful! Please check your email to confirm.');
        onSwitchToSignIn();
      } else {
        setError("Something went wrong with registration.");
      }
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-4">Register</h2>
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
        className="bg-green-500 text-white px-4 py-2 mb-2"
        onClick={handleRegister}
      >
        Register
      </button>
      <p className="text-sm">
        Already have an account?{' '}
        <button className="text-blue-500 underline" onClick={onSwitchToSignIn}>
          Sign In
        </button>
      </p>
    </div>
  );
}
