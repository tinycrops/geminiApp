// Global variables
let currentExperience = null;
let chatSessionId = null;
let allExperiences = [];

// DOM elements
const experiencesList = document.getElementById('experiences-list');
const experienceSearchInput = document.getElementById('experience-search');
const tagFilterInput = document.getElementById('tag-filter');
const searchBtn = document.getElementById('search-btn');
const newExperienceBtn = document.getElementById('new-experience-btn');
const editExperienceBtn = document.getElementById('edit-experience-btn');
const deleteExperienceBtn = document.getElementById('delete-experience-btn');
const addRelationBtn = document.getElementById('add-relation-btn');
const chatMessages = document.getElementById('chat-messages');
const messageInput = document.getElementById('message-input');
const sendMessageBtn = document.getElementById('send-message-btn');
const newChatBtn = document.getElementById('new-chat-btn');

// Experience detail elements
const detailTitle = document.getElementById('detail-title');
const detailId = document.getElementById('detail-id');
const detailDescription = document.getElementById('detail-description');
const detailContext = document.getElementById('detail-context');
const detailTags = document.getElementById('detail-tags');
const detailImportance = document.getElementById('detail-importance');
const detailCreated = document.getElementById('detail-created');
const detailMetadata = document.getElementById('detail-metadata');
const relatedExperiences = document.getElementById('related-experiences');

// Modal elements
const experienceModal = new bootstrap.Modal(document.getElementById('experience-modal'));
const experienceForm = document.getElementById('experience-form');
const experienceIdInput = document.getElementById('experience-id');
const experienceTitleInput = document.getElementById('experience-title');
const experienceDescriptionInput = document.getElementById('experience-description');
const experienceContextInput = document.getElementById('experience-context');
const experienceTagsInput = document.getElementById('experience-tags');
const experienceImportanceInput = document.getElementById('experience-importance');
const experienceMetadataInput = document.getElementById('experience-metadata');
const saveExperienceBtn = document.getElementById('save-experience-btn');

// Relation modal elements
const relationModal = new bootstrap.Modal(document.getElementById('relation-modal'));
const relationForm = document.getElementById('relation-form');
const relationSourceIdInput = document.getElementById('relation-source-id');
const relationTargetSelect = document.getElementById('relation-target');
const relationTypeSelect = document.getElementById('relation-type');
const customRelationTypeContainer = document.getElementById('custom-relation-type-container');
const customRelationTypeInput = document.getElementById('custom-relation-type');
const relationStrengthInput = document.getElementById('relation-strength');
const strengthValueSpan = document.getElementById('strength-value');
const saveRelationBtn = document.getElementById('save-relation-btn');

// API functions
async function fetchExperiences(query = '', tags = []) {
    try {
        let url = '/api/experiences';
        const params = new URLSearchParams();
        
        if (query) {
            params.append('query', query);
        }
        
        if (tags.length > 0) {
            params.append('tags', JSON.stringify(tags));
        }
        
        if (params.toString()) {
            url += `?${params.toString()}`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success) {
            allExperiences = data.experiences;
            return data.experiences;
        } else {
            throw new Error(data.error || 'Failed to fetch experiences');
        }
    } catch (error) {
        console.error('Error fetching experiences:', error);
        showAlert('error', `Failed to fetch experiences: ${error.message}`);
        return [];
    }
}

async function fetchExperienceById(id) {
    try {
        const response = await fetch(`/api/experiences/${id}`);
        const data = await response.json();
        
        if (data.success) {
            return data.experience;
        } else {
            throw new Error(data.error || 'Failed to fetch experience');
        }
    } catch (error) {
        console.error(`Error fetching experience ${id}:`, error);
        showAlert('error', `Failed to fetch experience: ${error.message}`);
        return null;
    }
}

async function fetchRelatedExperiences(id, relationType = null) {
    try {
        let url = `/api/experiences/${id}/related`;
        
        if (relationType) {
            url += `?relationType=${encodeURIComponent(relationType)}`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success) {
            return data.relatedExperiences;
        } else {
            throw new Error(data.error || 'Failed to fetch related experiences');
        }
    } catch (error) {
        console.error(`Error fetching related experiences for ${id}:`, error);
        showAlert('error', `Failed to fetch related experiences: ${error.message}`);
        return [];
    }
}

async function createExperience(experienceData) {
    try {
        const response = await fetch('/api/experiences', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(experienceData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            return data.experience;
        } else {
            throw new Error(data.error || 'Failed to create experience');
        }
    } catch (error) {
        console.error('Error creating experience:', error);
        showAlert('error', `Failed to create experience: ${error.message}`);
        return null;
    }
}

async function updateExperience(id, experienceData) {
    try {
        const response = await fetch(`/api/experiences/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(experienceData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            return data.experience;
        } else {
            throw new Error(data.error || 'Failed to update experience');
        }
    } catch (error) {
        console.error(`Error updating experience ${id}:`, error);
        showAlert('error', `Failed to update experience: ${error.message}`);
        return null;
    }
}

async function deleteExperience(id) {
    try {
        const response = await fetch(`/api/experiences/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            return true;
        } else {
            throw new Error(data.error || 'Failed to delete experience');
        }
    } catch (error) {
        console.error(`Error deleting experience ${id}:`, error);
        showAlert('error', `Failed to delete experience: ${error.message}`);
        return false;
    }
}

async function createRelation(sourceId, targetId, relationType, strength) {
    try {
        const response = await fetch('/api/relations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sourceId,
                targetId,
                relationType,
                strength
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            return true;
        } else {
            throw new Error(data.error || 'Failed to create relation');
        }
    } catch (error) {
        console.error('Error creating relation:', error);
        showAlert('error', `Failed to create relation: ${error.message}`);
        return false;
    }
}

async function createChatSession() {
    try {
        const response = await fetch('/api/chat/session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                systemInstructions: ''
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            return data.sessionId;
        } else {
            throw new Error(data.error || 'Failed to create chat session');
        }
    } catch (error) {
        console.error('Error creating chat session:', error);
        showAlert('error', `Failed to create chat session: ${error.message}`);
        return null;
    }
}

async function sendChatMessage(sessionId, message) {
    try {
        const response = await fetch(`/api/chat/session/${sessionId}/message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            return data.response;
        } else {
            throw new Error(data.error || 'Failed to send message');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        showAlert('error', `Failed to send message: ${error.message}`);
        return null;
    }
}

// UI functions
function showAlert(type, message) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type === 'error' ? 'danger' : 'success'} alert-dismissible fade show position-fixed top-0 end-0 m-3`;
    alertDiv.role = 'alert';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    document.body.appendChild(alertDiv);
    
    // Auto dismiss after 5 seconds
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.parentNode.removeChild(alertDiv);
        }
    }, 5000);
}

function displayExperiences(experiences) {
    experiencesList.innerHTML = '';
    
    if (experiences.length === 0) {
        experiencesList.innerHTML = '<div class="list-group-item">No experiences found</div>';
        return;
    }
    
    experiences.forEach(experience => {
        const experienceItem = document.createElement('div');
        experienceItem.className = 'list-group-item d-flex justify-content-between align-items-center';
        
        if (currentExperience && currentExperience.experience_id === experience.experience_id) {
            experienceItem.classList.add('active');
        }
        
        // Determine importance class
        let importanceClass = 'importance-medium';
        if (experience.importance >= 8) {
            importanceClass = 'importance-high';
        } else if (experience.importance <= 3) {
            importanceClass = 'importance-low';
        }
        
        experienceItem.innerHTML = `
            <div>
                <div class="d-flex justify-content-between align-items-center">
                    <h6 class="mb-1">${experience.title}</h6>
                    <span class="importance-badge ${importanceClass}">${experience.importance}</span>
                </div>
                <p class="mb-1 text-truncate" style="max-width: 200px;">${experience.description}</p>
                <small class="text-muted">${formatDate(experience.created_at)}</small>
            </div>
        `;
        
        experienceItem.dataset.id = experience.experience_id;
        experienceItem.addEventListener('click', () => loadExperienceDetails(experience.experience_id));
        
        experiencesList.appendChild(experienceItem);
    });
}

async function loadExperienceDetails(experienceId) {
    // Clear current experience details
    clearExperienceDetails();
    
    // Show loading indicator
    detailTitle.textContent = 'Loading...';
    
    // Fetch experience details
    const experience = await fetchExperienceById(experienceId);
    
    if (!experience) {
        detailTitle.textContent = 'Error loading experience';
        return;
    }
    
    // Save current experience
    currentExperience = experience;
    
    // Update experience list selection
    const experienceItems = experiencesList.querySelectorAll('.list-group-item');
    experienceItems.forEach(item => {
        if (item.dataset.id === experienceId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Update UI with experience details
    detailTitle.textContent = experience.title;
    detailId.textContent = `ID: ${experience.experience_id}`;
    detailDescription.textContent = experience.description;
    detailContext.textContent = experience.context || 'No context provided';
    
    // Display tags
    detailTags.innerHTML = '';
    if (experience.tags && experience.tags.length > 0) {
        experience.tags.forEach(tag => {
            const tagSpan = document.createElement('span');
            tagSpan.className = 'tag';
            tagSpan.textContent = tag;
            detailTags.appendChild(tagSpan);
        });
    } else {
        detailTags.innerHTML = '<em>No tags</em>';
    }
    
    // Display importance
    detailImportance.textContent = experience.importance || 'Not set';
    
    // Display created date
    detailCreated.textContent = formatDate(experience.created_at);
    
    // Display metadata
    if (experience.metadata) {
        try {
            const metadataStr = JSON.stringify(experience.metadata, null, 2);
            detailMetadata.textContent = metadataStr;
        } catch (error) {
            detailMetadata.textContent = 'Invalid metadata format';
        }
    } else {
        detailMetadata.textContent = 'No metadata';
    }
    
    // Enable buttons
    editExperienceBtn.disabled = false;
    deleteExperienceBtn.disabled = false;
    addRelationBtn.disabled = false;
    
    // Load related experiences
    await loadRelatedExperiences(experience.id);
}

async function loadRelatedExperiences(experienceId) {
    // Clear current related experiences
    relatedExperiences.innerHTML = '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>';
    
    // Fetch related experiences
    const related = await fetchRelatedExperiences(experienceId);
    
    // Display related experiences
    relatedExperiences.innerHTML = '';
    
    if (related.length === 0) {
        relatedExperiences.innerHTML = '<div class="text-muted">No related experiences</div>';
        return;
    }
    
    related.forEach(rel => {
        const relItem = document.createElement('a');
        relItem.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
        relItem.href = '#';
        
        relItem.innerHTML = `
            <div>
                <h6 class="mb-1">${rel.title}</h6>
                <p class="mb-1 text-truncate" style="max-width: 250px;">${rel.description}</p>
                <div class="d-flex justify-content-between align-items-center">
                    <small class="text-muted">${formatDate(rel.created_at)}</small>
                    <span class="badge bg-info">${rel.relation_type} (${rel.strength})</span>
                </div>
            </div>
        `;
        
        relItem.addEventListener('click', (e) => {
            e.preventDefault();
            loadExperienceDetails(rel.experience_id);
        });
        
        relatedExperiences.appendChild(relItem);
    });
}

function clearExperienceDetails() {
    detailTitle.textContent = 'Select an experience';
    detailId.textContent = '';
    detailDescription.textContent = '';
    detailContext.textContent = '';
    detailTags.innerHTML = '';
    detailImportance.textContent = '';
    detailCreated.textContent = '';
    detailMetadata.textContent = '';
    relatedExperiences.innerHTML = '';
    
    // Disable buttons
    editExperienceBtn.disabled = true;
    deleteExperienceBtn.disabled = true;
    addRelationBtn.disabled = true;
    
    // Clear current experience
    currentExperience = null;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString();
}

function openExperienceModal(isEdit = false) {
    // Reset form
    experienceForm.reset();
    
    if (isEdit && currentExperience) {
        // Fill form with current experience data
        document.getElementById('experienceModalLabel').textContent = 'Edit Experience';
        experienceIdInput.value = currentExperience.experience_id;
        experienceTitleInput.value = currentExperience.title;
        experienceDescriptionInput.value = currentExperience.description;
        experienceContextInput.value = currentExperience.context || '';
        experienceTagsInput.value = currentExperience.tags ? currentExperience.tags.join(', ') : '';
        experienceImportanceInput.value = currentExperience.importance || 5;
        
        if (currentExperience.metadata) {
            try {
                experienceMetadataInput.value = JSON.stringify(currentExperience.metadata);
            } catch (error) {
                experienceMetadataInput.value = '';
            }
        } else {
            experienceMetadataInput.value = '';
        }
    } else {
        // Set up for new experience
        document.getElementById('experienceModalLabel').textContent = 'Create New Experience';
        experienceIdInput.value = '';
    }
    
    // Show modal
    experienceModal.show();
}

function openRelationModal() {
    if (!currentExperience) {
        showAlert('error', 'No experience selected');
        return;
    }
    
    // Reset form
    relationForm.reset();
    
    // Set source experience ID
    relationSourceIdInput.value = currentExperience.experience_id;
    
    // Populate target experience dropdown
    relationTargetSelect.innerHTML = '<option value="" selected disabled>Select an experience</option>';
    
    allExperiences.forEach(exp => {
        if (exp.experience_id !== currentExperience.experience_id) {
            const option = document.createElement('option');
            option.value = exp.experience_id;
            option.textContent = exp.title;
            relationTargetSelect.appendChild(option);
        }
    });
    
    // Reset custom relation type field
    customRelationTypeContainer.classList.add('d-none');
    
    // Show modal
    relationModal.show();
}

async function saveExperience() {
    // Validate form
    if (!experienceForm.checkValidity()) {
        experienceForm.reportValidity();
        return;
    }
    
    // Prepare experience data
    const experienceData = {
        title: experienceTitleInput.value,
        description: experienceDescriptionInput.value,
        context: experienceContextInput.value,
        tags: experienceTagsInput.value ? experienceTagsInput.value.split(',').map(tag => tag.trim()) : [],
        importance: parseInt(experienceImportanceInput.value)
    };
    
    // Add metadata if provided
    if (experienceMetadataInput.value) {
        try {
            experienceData.metadata = JSON.parse(experienceMetadataInput.value);
        } catch (error) {
            showAlert('error', 'Invalid JSON in metadata field');
            return;
        }
    }
    
    // Determine if this is a create or update operation
    const isEdit = !!experienceIdInput.value;
    
    try {
        if (isEdit) {
            // Update existing experience
            const updatedExperience = await updateExperience(experienceIdInput.value, experienceData);
            
            if (updatedExperience) {
                showAlert('success', 'Experience updated successfully');
                experienceModal.hide();
                
                // Refresh experiences list and detail view
                await refreshExperiences();
                await loadExperienceDetails(updatedExperience.experience_id);
            }
        } else {
            // Create new experience
            const newExperience = await createExperience(experienceData);
            
            if (newExperience) {
                showAlert('success', 'Experience created successfully');
                experienceModal.hide();
                
                // Refresh experiences list and load new experience
                await refreshExperiences();
                await loadExperienceDetails(newExperience.experience_id);
            }
        }
    } catch (error) {
        console.error('Error saving experience:', error);
        showAlert('error', `Failed to save experience: ${error.message}`);
    }
}

async function saveRelation() {
    // Validate form
    if (!relationForm.checkValidity()) {
        relationForm.reportValidity();
        return;
    }
    
    // Get relation data
    const sourceId = relationSourceIdInput.value;
    const targetId = relationTargetSelect.value;
    let relationType = relationTypeSelect.value;
    
    // Handle custom relation type
    if (relationType === 'custom') {
        relationType = customRelationTypeInput.value;
        
        if (!relationType) {
            showAlert('error', 'Custom relation type is required');
            return;
        }
    }
    
    const strength = parseFloat(relationStrengthInput.value);
    
    // Create relation
    const success = await createRelation(sourceId, targetId, relationType, strength);
    
    if (success) {
        showAlert('success', 'Relation created successfully');
        relationModal.hide();
        
        // Refresh related experiences
        if (currentExperience) {
            await loadRelatedExperiences(currentExperience.id);
        }
    }
}

async function confirmDeleteExperience() {
    if (!currentExperience) {
        return;
    }
    
    if (confirm(`Are you sure you want to delete experience "${currentExperience.title}"?`)) {
        const success = await deleteExperience(currentExperience.experience_id);
        
        if (success) {
            showAlert('success', 'Experience deleted successfully');
            
            // Refresh experiences list and clear detail view
            await refreshExperiences();
            clearExperienceDetails();
        }
    }
}

async function refreshExperiences() {
    const query = experienceSearchInput.value;
    const tags = tagFilterInput.value ? tagFilterInput.value.split(',').map(tag => tag.trim()) : [];
    
    const experiences = await fetchExperiences(query, tags);
    displayExperiences(experiences);
}

async function handleSearch() {
    await refreshExperiences();
}

async function startNewChat() {
    // Clear chat messages
    chatMessages.innerHTML = '';
    
    // Create new chat session
    chatSessionId = await createChatSession();
    
    if (chatSessionId) {
        // Enable message input and send button
        messageInput.disabled = false;
        sendMessageBtn.disabled = false;
        
        // Add welcome message
        addChatMessage('Welcome to Gemini Memory Chat! How can I help you today?', 'assistant');
        
        // Focus on message input
        messageInput.focus();
    } else {
        messageInput.disabled = true;
        sendMessageBtn.disabled = true;
    }
}

async function handleSendMessage() {
    if (!chatSessionId) {
        showAlert('error', 'No active chat session');
        return;
    }
    
    const message = messageInput.value.trim();
    
    if (!message) {
        return;
    }
    
    // Clear input field
    messageInput.value = '';
    
    // Add user message to chat
    addChatMessage(message, 'user');
    
    // Disable input and show loading indicator
    messageInput.disabled = true;
    sendMessageBtn.disabled = true;
    
    // Show typing indicator
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'message assistant-message typing-indicator';
    typingIndicator.innerHTML = '<div class="spinner-grow spinner-grow-sm" role="status"><span class="visually-hidden">Loading...</span></div>';
    chatMessages.appendChild(typingIndicator);
    scrollChatToBottom();
    
    // Send message to API
    const response = await sendChatMessage(chatSessionId, message);
    
    // Remove typing indicator
    chatMessages.removeChild(typingIndicator);
    
    if (response) {
        // Add assistant message to chat
        addChatMessage(response.text, 'assistant');
        
        // Add tool call information if available
        if (response.toolCalls && response.toolCalls.length > 0) {
            addToolCallMessage(response.toolCalls);
        }
        
        // Add follow-up response if available
        if (response.followUpResponse) {
            addChatMessage(response.followUpResponse, 'assistant');
        }
    }
    
    // Re-enable input
    messageInput.disabled = false;
    sendMessageBtn.disabled = false;
    messageInput.focus();
}

function addChatMessage(text, role) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message`;
    
    // Sanitize and format text
    const sanitizedText = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    messageDiv.innerHTML = formatMessageText(sanitizedText);
    
    chatMessages.appendChild(messageDiv);
    scrollChatToBottom();
}

function addToolCallMessage(toolCalls) {
    const toolCallDiv = document.createElement('div');
    toolCallDiv.className = 'tool-call';
    
    const toolCall = toolCalls[0]; // We only handle one tool call for now
    
    let resultHTML = '';
    if (toolCall.result && typeof toolCall.result === 'object') {
        try {
            resultHTML = `<pre>${JSON.stringify(toolCall.result, null, 2)}</pre>`;
        } catch (error) {
            resultHTML = 'Tool call result available but cannot be displayed';
        }
    } else if (toolCall.error) {
        resultHTML = `<div class="text-danger">${toolCall.error}</div>`;
    }
    
    toolCallDiv.innerHTML = `
        <div><strong>Tool:</strong> ${toolCall.name}</div>
        <div><strong>Arguments:</strong> <pre>${JSON.stringify(toolCall.args, null, 2)}</pre></div>
        ${resultHTML ? `<div><strong>Result:</strong> ${resultHTML}</div>` : ''}
    `;
    
    chatMessages.appendChild(toolCallDiv);
    scrollChatToBottom();
}

function formatMessageText(text) {
    // Simple formatting for message text
    // Replace newlines with <br>
    return text.replace(/\n/g, '<br>');
}

function scrollChatToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Event listeners
document.addEventListener('DOMContentLoaded', async () => {
    // Load initial experiences
    await refreshExperiences();
    
    // Search button
    searchBtn.addEventListener('click', handleSearch);
    
    // Search input enter key
    experienceSearchInput.addEventListener('keyup', e => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });
    
    // Tag filter input enter key
    tagFilterInput.addEventListener('keyup', e => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });
    
    // New experience button
    newExperienceBtn.addEventListener('click', () => openExperienceModal(false));
    
    // Edit experience button
    editExperienceBtn.addEventListener('click', () => openExperienceModal(true));
    
    // Delete experience button
    deleteExperienceBtn.addEventListener('click', confirmDeleteExperience);
    
    // Save experience button
    saveExperienceBtn.addEventListener('click', saveExperience);
    
    // Add relation button
    addRelationBtn.addEventListener('click', openRelationModal);
    
    // Relation type select change
    relationTypeSelect.addEventListener('change', () => {
        if (relationTypeSelect.value === 'custom') {
            customRelationTypeContainer.classList.remove('d-none');
        } else {
            customRelationTypeContainer.classList.add('d-none');
        }
    });
    
    // Relation strength input change
    relationStrengthInput.addEventListener('input', () => {
        strengthValueSpan.textContent = relationStrengthInput.value;
    });
    
    // Save relation button
    saveRelationBtn.addEventListener('click', saveRelation);
    
    // New chat button
    newChatBtn.addEventListener('click', startNewChat);
    
    // Send message button
    sendMessageBtn.addEventListener('click', handleSendMessage);
    
    // Message input enter key
    messageInput.addEventListener('keyup', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });
}); 