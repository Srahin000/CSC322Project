// Import necessary React hooks and components
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../config/supabaseClient";
import AddCollaborator from "../Components/AddCollaborator";
import SidebarMenu from "../Components/SidebarMenu";

// Component to display user's files and manage collaborators
export default function MyFiles() {
  // State to hold list of user's files (owned and collaborated)
  const [files, setFiles] = useState([]);
  // ID of the file selected to manage collaborators
  const [selectedFileId, setSelectedFileId] = useState(null);
  // Boolean to toggle the collaborator modal
  const [showCollaboratorModal, setShowCollaboratorModal] = useState(false);
  // Sidebar open state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const navigate = useNavigate(); // React Router hook for navigation

  // useEffect to fetch user's files when the component mounts
  useEffect(() => {
    const fetchFiles = async () => {
      // Get current user session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return; // Exit if user is not logged in
      }
    
      // Fetch files created by the user
      const { data: ownedFiles, error: ownedError } = await supabase
        .from('texts')
        .select('id, title, created_at')
        .eq('user_id', session.user.id);
    
      // Fetch collaboration entries where the user is a collaborator
      const { data: collaborationEntries, error: collabError } = await supabase
        .from('text_collaborators')
        .select('text_id')
        .eq('user_id', session.user.id);
    
      let collaboratorFiles = [];
    
      // If the user collaborates on files, fetch those file details
      if (collaborationEntries?.length) {
        const textIds = collaborationEntries.map(entry => entry.text_id);
    
        const { data: texts, error: textError } = await supabase
          .from('texts')
          .select('id, title, created_at')
          .in('id', textIds);
    
        collaboratorFiles = texts || [];
      }
    
      // Handle any errors that occurred
      if (ownedError || collabError) {
        console.error(ownedError || collabError);
      } else {
        // Combine owned files and collaborator files into one list
        setFiles([...ownedFiles, ...collaboratorFiles]);
      }
    };

    fetchFiles(); // Call the function
  }, []);

  // Navigate to the file editor page for the selected file
  const handleOpenFile = (id) => {
    navigate(`/editor/${id}`);
  };

  // Open the modal to manage collaborators for a specific file
  const handleAddCollaborator = (fileId) => {
    setSelectedFileId(fileId);
    setShowCollaboratorModal(true);
  };

  return (
    <div className="relative flex h-screen w-screen bg-blue-50">
      {/* Sidebar navigation component */}
      <SidebarMenu sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <div className="flex-1 p-6 transition-all duration-200 w-full">
        <div className="bg-white rounded-xl shadow p-8 w-full h-full">

          {/* Button to create a new file */}
          <button
            className="bg-blue-600 text-white px-6 py-3 mb-6 rounded-lg text-lg font-semibold shadow hover:bg-blue-700 transition"
            onClick={() => navigate("/editor")}
          >
            ➕ New File
          </button>

          <h1 className="text-2xl font-extrabold mb-8 text-blue-800">My Files</h1>

          {/* Display each file the user owns or collaborates on */}
          <div className="space-y-6">
            {files.map(file => (
              <div key={file.id} className="border border-blue-100 p-6 rounded-xl shadow-sm bg-blue-50">
                <div className="flex justify-between items-center">
                  <div>
                    {/* File title and creation timestamp */}
                    <p className="font-semibold text-blue-900 text-lg">{file.title}</p>
                    <p className="text-sm text-blue-500">
                      {new Date(file.created_at).toLocaleString()}
                    </p>
                  </div>

                  {/* Buttons to open or manage the file */}
                  <div className="flex gap-2">
                    <button
                      className="bg-blue-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-600 transition"
                      onClick={() => handleOpenFile(file.id)}
                    >
                      Open
                    </button>
                    <button
                      className="bg-blue-400 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-500 transition"
                      onClick={() => handleAddCollaborator(file.id)}
                    >
                      Manage Collaborators
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Collaborator modal component, rendered when activated */}
          {showCollaboratorModal && (
            <AddCollaborator
              fileId={selectedFileId}
              onClose={() => {
                setShowCollaboratorModal(false);
                setSelectedFileId(null); // Clear selected file ID on close
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
