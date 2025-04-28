// Sandbox service for executing code in a controlled environment
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default timeout for code execution (in milliseconds)
const DEFAULT_TIMEOUT = 5000;

// Sandbox directory where temporary files will be stored
const SANDBOX_DIR = path.join(os.tmpdir(), 'gemini-sandbox');

// Ensure sandbox directory exists
if (!fs.existsSync(SANDBOX_DIR)) {
  fs.mkdirSync(SANDBOX_DIR, { recursive: true });
}

// Clean up old files in the sandbox directory (keep only files created in the last hour)
function cleanupSandbox() {
  const now = Date.now();
  const files = fs.readdirSync(SANDBOX_DIR);
  
  for (const file of files) {
    const filePath = path.join(SANDBOX_DIR, file);
    const stats = fs.statSync(filePath);
    
    // If the file is older than 1 hour, delete it
    if (now - stats.mtime.getTime() > 60 * 60 * 1000) {
      fs.unlinkSync(filePath);
    }
  }
}

// Clean up on startup
cleanupSandbox();

// Execute JavaScript code
function executeJavaScript(code, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const filename = `${uuidv4()}.js`;
    const filepath = path.join(SANDBOX_DIR, filename);
    
    // Add some safety measures to the code
    const safeCode = `
      // Limit execution time
      setTimeout(() => {
        console.error('Execution timed out');
        process.exit(1);
      }, ${timeout - 500});
      
      // Capture console.log
      const originalLog = console.log;
      let output = [];
      console.log = function(...args) {
        output.push(args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' '));
        originalLog.apply(console, args);
      };
      
      try {
        ${code}
        console.log('\\n-- Output --\\n' + output.join('\\n'));
      } catch (error) {
        console.error('Error:', error.message);
      }
    `;
    
    // Write code to file
    fs.writeFileSync(filepath, safeCode);
    
    // Execute code
    exec(`node ${filepath}`, { timeout }, (error, stdout, stderr) => {
      // Clean up
      try {
        fs.unlinkSync(filepath);
      } catch (e) {
        console.error('Failed to clean up file:', e);
      }
      
      if (error && error.killed) {
        reject(new Error('Execution timed out'));
      } else if (stderr) {
        resolve({ output: stderr, error: true });
      } else {
        resolve({ output: stdout, error: false });
      }
    });
  });
}

// Execute Python code
function executePython(code, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const filename = `${uuidv4()}.py`;
    const filepath = path.join(SANDBOX_DIR, filename);
    
    // Write code to file
    fs.writeFileSync(filepath, code);
    
    // Execute code
    exec(`python ${filepath}`, { timeout }, (error, stdout, stderr) => {
      // Clean up
      try {
        fs.unlinkSync(filepath);
      } catch (e) {
        console.error('Failed to clean up file:', e);
      }
      
      if (error && error.killed) {
        reject(new Error('Execution timed out'));
      } else if (stderr) {
        resolve({ output: stderr, error: true });
      } else {
        resolve({ output: stdout, error: false });
      }
    });
  });
}

// Execute bash commands (with strict limitations)
function executeBash(code, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    // Disallow potentially dangerous commands
    const dangerousCommands = [
      'rm', 'rmdir', 'mv', 'cp', 'chmod', 'chown', 'touch',
      'sudo', 'su', '>', '>>', '|', ';', '&&', '||'
    ];
    
    // Check if the code contains any dangerous commands
    for (const cmd of dangerousCommands) {
      if (code.includes(cmd)) {
        return reject(new Error(`Dangerous command detected: ${cmd}`));
      }
    }
    
    // Execute bash command
    exec(code, { timeout, shell: '/bin/bash' }, (error, stdout, stderr) => {
      if (error && error.killed) {
        reject(new Error('Execution timed out'));
      } else if (stderr) {
        resolve({ output: stderr, error: true });
      } else {
        resolve({ output: stdout, error: false });
      }
    });
  });
}

// Main execute function that routes to the appropriate executor
async function executeCode(language, code, timeout = DEFAULT_TIMEOUT) {
  try {
    switch (language.toLowerCase()) {
      case 'javascript':
      case 'nodejs':
        return await executeJavaScript(code, timeout);
      case 'python':
        return await executePython(code, timeout);
      case 'bash':
        return await executeBash(code, timeout);
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
  } catch (error) {
    return { output: error.message, error: true };
  }
}

export { executeCode }; 