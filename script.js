// Initialize the canvas
const canvas = new fabric.Canvas('canvas'); // Reverted to original initialization

// --- Undo/Redo History ---
let canvasHistory = [];
let historyLock = false;

function saveState() {
    if (!historyLock) {
        canvasHistory.push(canvas.toJSON());
    }
}

function undo() {
    if (canvasHistory.length > 1) { // Keep the initial state
        historyLock = true; // Lock history to prevent saving the undone state
        canvasHistory.pop(); // The current state
        canvas.loadFromJSON(canvasHistory[canvasHistory.length - 1], () => {
            canvas.renderAll();
            historyLock = false; // Unlock history
        });
    } else {
        console.log("Can't undo further");
    }
}

// --- Robust B64 <-> Uint8Array Functions ---
function uint8ArrayToBase64(bytes) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function base64ToUint8Array(base64) {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes;
}


// --- Initial Canvas Setup ---
function initializeCanvas() {
    const hash = window.location.hash.substring(1);
    if (hash) {
        try {
            const compressedBytes = base64ToUint8Array(hash);
            const jsonString = pako.inflate(compressedBytes, { to: 'string' });
            canvas.loadFromJSON(jsonString, () => {
                canvas.renderAll();
                saveState(); // Save this loaded state as the first history item
            });
        } catch (e) {
            console.error("Could not load canvas from URL hash:", e);
            // If loading fails, start with a blank canvas
            canvas.renderAll();
            saveState();
        }
    } else {
        // If no hash, start with a blank canvas
        canvas.renderAll();
        saveState();
    }
}

// --- Canvas Event Listeners for Undo ---
canvas.on({
    'object:added': saveState,
    'object:removed': saveState,
    'object:modified': saveState
});


// --- Download & Share Functionality ---
document.getElementById('download-svg').addEventListener('click', function() {
  const svg = canvas.toSVG();
  const blob = new Blob([svg], {type: 'image/svg+xml'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'canvas.svg';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
});

document.getElementById('share-link').addEventListener('click', function() {
    const json = JSON.stringify(canvas.toJSON());
    const compressed = pako.deflate(json);
    const encoded = uint8ArrayToBase64(compressed);
    history.replaceState(null, '', '#' + encoded);
    // Optional: Give user feedback
    const shareButton = document.getElementById('share-link');
    const originalText = shareButton.textContent;
    shareButton.textContent = 'Link Updated in URL!';
    setTimeout(() => {
        shareButton.textContent = originalText;
    }, 2000);
});

// --- Night Mode ---
function applyNightMode(isNightMode) {
    if (isNightMode) {
        document.body.classList.add('night-mode');
        canvas.backgroundColor = '#333';
    } else {
        document.body.classList.remove('night-mode');
        canvas.backgroundColor = '#fff'; // Or your default light mode canvas color
    }
    canvas.renderAll();
}

document.getElementById('night-mode-toggle').addEventListener('click', function() {
    const isNightMode = document.body.classList.toggle('night-mode');
    applyNightMode(isNightMode);
    localStorage.setItem('nightMode', isNightMode); // Save state to local storage
});


// --- AI-Powered Changes Functionality ---
const applyButton = document.getElementById('apply-changes');
const apiKeyInput = document.getElementById('api-key');
const promptInput = document.getElementById('prompt');
const aceEditorContainer = document.getElementById('ace-editor-container');
const generalMessageBox = document.getElementById('general-message-box');
const objectLabelInput = document.getElementById('object-label');
const showCodeCheckbox = document.getElementById('show-code-checkbox');
const runAceCodeButton = document.getElementById('run-ace-code');

let lastGeneratedCode = ''; // To store the full generated code

function showMessage(message, isCode = false) {
    if (isCode) {
        generalMessageBox.style.display = 'none';
        aceEditorContainer.style.display = 'block';
        initializeAceEditor();
        aceEditor.setValue(message, -1); // -1 moves cursor to start
    } else {
        if (aceEditor) {
            destroyAceEditor();
        }
        aceEditorContainer.style.display = 'none';
        generalMessageBox.style.display = 'block';
        generalMessageBox.textContent = message;
    }
}

// Canvas selection events to update the label input
canvas.on('selection:created', updateObjectLabelInput);
canvas.on('selection:updated', updateObjectLabelInput);
canvas.on('selection:cleared', clearObjectLabelInput);

function updateObjectLabelInput() {
    const activeObject = canvas.getActiveObject();
    if (activeObject && activeObject.label) {
        objectLabelInput.value = activeObject.label;
    } else {
        objectLabelInput.value = '';
        objectLabelInput.placeholder = 'No object selected or no label';
    }
}

function clearObjectLabelInput() {
    objectLabelInput.value = '';
    objectLabelInput.placeholder = 'No object selected';
}

// Event listener for the label input field to update the object's label
objectLabelInput.addEventListener('input', function() {
    const activeObject = canvas.getActiveObject();
    if (activeObject) {
        activeObject.set('label', this.value);
        canvas.renderAll();
    }
});

// Removed hideMessage function entirely

// --- Local Storage for API Key ---
function loadApiKey() {
    const savedKey = localStorage.getItem('geminiApiKey');
    if (savedKey) {
        apiKeyInput.value = savedKey;
    }
}

function saveApiKey(key) {
    localStorage.setItem('geminiApiKey', key);
}

// Load the API key and night mode when the page loads
document.addEventListener('DOMContentLoaded', () => {
    loadApiKey();
    initializeCanvas(); // Setup canvas on page load

    // Load night mode state
    const savedNightMode = localStorage.getItem('nightMode');
    if (savedNightMode !== null) {
        applyNightMode(savedNightMode === 'true'); // localStorage stores as string
    }

    // Set initial button text
    applyButton.textContent = 'Generate';
});

applyButton.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  saveApiKey(apiKey); // Save the key on every click
  const userPrompt = promptInput.value.trim();
  // Removed hideMessage(); // Hide any previous messages

  if (!apiKey) {
    showMessage('Error: Please enter your Gemini API key.'); // Removed duration
    return;
  }

  if (!userPrompt) {
    showMessage('Error: Please enter a prompt.'); // Removed duration
    return;
  }

  const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

  const systemPrompt = `You are an expert in Fabric.js. Your task is to take a user's request and return only the JavaScript code required to modify the existing Fabric.js canvas object, which is named 'canvas'. All Fabric.js objects created or modified must include a 'label' attribute. Do not include any explanations, markdown, or any text other than the raw JavaScript code. The first line of code should be a comment commenting on the change being made.


For example, if the user says "make the rectangle blue", you should return:
// Created a blue rectangle labelled 'blue rectangle'
const rect = canvas.getObjects('rect')[0];
if (rect) {
  rect.set({ fill: 'blue', label: 'blue rectangle' });
  canvas.renderAll();
}

If the user says "add a new star at position 10, 10", you should return:
// added a star shape using fabric.Path labelled star.
const star = new fabric.Path('M 0 0 L 10 30 L 40 30 L 15 50 L 25 80 L 0 60 L -25 80 L -15 50 L -40 30 L -10 30 z');
star.set({ left: 10, top: 10, fill: 'yellow', label: 'yellow star' });
canvas.add(star);
canvas.renderAll();

Now, fulfill the user's request.

User's request:
---
${userPrompt}
---`;

  try {
    showMessage('Sending request to AI...');
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: systemPrompt
          }]
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${errorData.error.message}`);
    }

    const responseData = await response.json();
    let generatedCode = responseData.candidates[0].content.parts[0].text.replace(/```javascript|```/g, '').trim();
    lastGeneratedCode = generatedCode; // Store the full code

    // Extract the first line if it's a comment and display it in the message box
    const firstLine = generatedCode.split('\n')[0];
    let messageToDisplay = '';

    if (showCodeCheckbox.checked) {
        showMessage(generatedCode, true); // Pass true for isCode
    } else if (firstLine.startsWith('//')) {
        messageToDisplay = firstLine.substring(2).trim(); // Remove '//' and trim whitespace
        generatedCode = generatedCode.substring(firstLine.length).trim(); // Remove the comment line from the code
        showMessage(messageToDisplay);
    } else {
        showMessage('AI response received. Applying changes...');
    }

    historyLock = true; // Lock history during AI changes
    // DANGER: eval() can execute arbitrary code. Only use this in a trusted, local environment.
    eval(showCodeCheckbox.checked ? aceEditor.getValue() : generatedCode);
    historyLock = false; // Unlock history
    saveState(); // Save the entire AI change as a single undo state

    // If the checkbox is not checked and no comment was extracted, show a generic success message
    if (!showCodeCheckbox.checked && !firstLine.startsWith('//')) {
        showMessage('Changes applied successfully!');
    }

  } catch (error) {
    console.error('Error:', error);
    showMessage(`An error occurred: ${error.message}`, false);
  }
});


// --- Keyboard Shortcuts ---
document.getElementById('undo').addEventListener('click', undo);

let aceEditor = null; // Global variable to hold the Ace Editor instance

// Function to initialize Ace Editor
function initializeAceEditor() {
    if (!aceEditor) {
        aceEditor = ace.edit("ace-editor-container");
        aceEditor.setTheme("ace/theme/monokai"); // You can choose a different theme
        aceEditor.session.setMode("ace/mode/javascript");
        aceEditor.setOptions({
            fontSize: "10pt", // Smaller font size
            wrap: true // Wrap long lines
        });

        // Add a custom command for Cmd+Enter to trigger the apply button
        aceEditor.commands.addCommand({
            name: "applyChanges",
            bindKey: {win: "Ctrl-Enter", mac: "Command-Enter"},
            exec: function(editor) {
                runAceCodeButton.click();
            }
        });

    }
}

// Function to destroy Ace Editor
function destroyAceEditor() {
    if (aceEditor) {
        aceEditor.destroy();
        aceEditor.container.style.display = 'none'; // Hide the editor's div
        aceEditor = null;
    }
}

showCodeCheckbox.addEventListener('change', function() {
    if (this.checked) {
        // Initialize Ace Editor and set its content
        initializeAceEditor();
        aceEditor.setValue(lastGeneratedCode, -1); // -1 moves cursor to start
        aceEditorContainer.style.display = 'block'; // Show Ace Editor
        generalMessageBox.style.display = 'none'; // Hide general message box
        runAceCodeButton.style.display = 'block'; // Show the new button
    } else {
        // Destroy Ace Editor and show general message box
        destroyAceEditor(); // Destroy Ace Editor first
        aceEditorContainer.style.display = 'none'; // Hide Ace Editor
        generalMessageBox.style.display = 'block'; // Show general message box
        runAceCodeButton.style.display = 'none'; // Hide the new button
        const firstLine = lastGeneratedCode.split('\n')[0];
        if (firstLine.startsWith('//')) {
            generalMessageBox.textContent = firstLine.substring(2).trim();
        } else {
            generalMessageBox.textContent = 'Changes applied successfully!'; // Or a default message
        }
    }
});

runAceCodeButton.addEventListener('click', function() {
    if (aceEditor) {
        try {
            const codeToExecute = aceEditor.getValue();
            eval(codeToExecute);
            saveState(); // Save the state after manual code execution
        } catch (error) {
            console.error('Error executing code from editor:', error);
            showMessage(`Error executing code: ${error.message}`, false);
        }
    } else {
        showMessage('Ace Editor is not initialized.', false);
    }
});

promptInput.addEventListener('keydown', function(event) {
    // Check for Cmd+Enter on Mac or Ctrl+Enter on other OSes
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault(); // Prevent new line in textarea
        applyButton.click(); // Trigger the button click
    }
});

window.addEventListener('keydown', function(event) {
    const activeElement = document.activeElement;
    const isTyping = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');

    // Undo Shortcut
    if ((event.metaKey || event.ctrlKey) && event.key === 'z') {
        event.preventDefault();
        undo();
        return;
    }

    // Check if the user is typing in an input field for the delete shortcut
    if (isTyping) {
        return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault(); // Prevents browser from going back
        const activeObjects = canvas.getActiveObjects();
        if (activeObjects.length > 0) {
            activeObjects.forEach(obj => {
                canvas.remove(obj);
            });
            canvas.discardActiveObject();
            canvas.renderAll();
        }
    }
});