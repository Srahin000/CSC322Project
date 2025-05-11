import { useState, useEffect } from "react";
import supabase from "../config/supabaseClient";

export default function AddCollaborator({ fileId, onClose }) {
  const [collaborators, setCollaborators] = useState([]);
  const [newCollaboratorEmail, setNewCollaboratorEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    fetchCollaborators();
  }, [fileId]);

  const fetchCollaborators = async () => {
    try {
      setLoading(true);
      // Fetch current collaborators
      const { data: collaboratorsData, error: collabError } = await supabase
        .from("text_collaborators")
        .select(`
          id,
          user_id,
          profiles:user_id (
            id,
            email
          )
        `)
        .eq("text_id", fileId);

      if (collabError) throw collabError;
      setCollaborators(collaboratorsData || []);
    } catch (error) {
      console.error("Error fetching collaborators:", error);
      setError("Failed to load collaborators");
    } finally {
      setLoading(false);
    }
  };

  const handleAddCollaborator = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      // First, find the user by email
      const { data: userData, error: userError } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", newCollaboratorEmail)
        .single();

      if (userError || !userData) {
        setError("User not found");
        return;
      }

      // Check if user is already a collaborator
      const isAlreadyCollaborator = collaborators.some(
        (c) => c.profiles.id === userData.id
      );

      if (isAlreadyCollaborator) {
        setError("User is already a collaborator");
        return;
      }

      // Create collaboration invite
      const { error: inviteError } = await supabase
        .from("collaboration_invites")
        .insert({
          inviter_id: (await supabase.auth.getSession()).data.session.user.id,
          invitee_id: userData.id,
          file_id: parseInt(fileId, 10),
          status: "pending"
        });

      if (inviteError) {
        console.error(inviteError);
        throw inviteError;
      }

      setSuccess("Collaboration invite sent successfully");
      setNewCollaboratorEmail("");
    } catch (error) {
      console.error("Error adding collaborator:", error);
      setError("Failed to send collaboration invite");
    }
  };

  const handleRemoveCollaborator = async (collaboratorId) => {
    try {
      const { error } = await supabase
        .from("text_collaborators")
        .delete()
        .eq("id", collaboratorId);

      if (error) throw error;

      setCollaborators(prev => 
        prev.filter(c => c.id !== collaboratorId)
      );
      setSuccess("Collaborator removed successfully");
    } catch (error) {
      console.error("Error removing collaborator:", error);
      setError("Failed to remove collaborator");
    }
  };

  if (loading) {
    return <div className="p-4">Loading collaborators...</div>;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Manage Collaborators</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        {/* Current Collaborators */}
        <div className="mb-6">
          <h3 className="font-semibold mb-2">Current Collaborators</h3>
          {collaborators.length === 0 ? (
            <p className="text-gray-500">No collaborators yet</p>
          ) : (
            <div className="space-y-2">
              {collaborators.map((collab) => (
                <div
                  key={collab.id}
                  className="flex justify-between items-center p-2 bg-gray-50 rounded"
                >
                  <div>
                    <p className="font-medium">{collab.profiles.email}</p>
                    <p className="text-sm text-gray-500">{collab.role}</p>
                  </div>
                  <button
                    onClick={() => handleRemoveCollaborator(collab.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add New Collaborator */}
        <form onSubmit={handleAddCollaborator} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Add Collaborator by Email
            </label>
            <input
              type="email"
              id="email"
              value={newCollaboratorEmail}
              onChange={(e) => setNewCollaboratorEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="Enter email address"
              required
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}
          {success && (
            <p className="text-green-600 text-sm">{success}</p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Send Invite
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 