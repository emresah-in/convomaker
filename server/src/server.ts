// TEST COMMENT - DELETE THIS LATER
import express, { Request, Response } from 'express';
import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

// --- Helper Function for Avatar Color (from React component) ---
const stringToColor = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    let color = '#';
    for (let i = 0; i < 3; i++) {
        const value = (hash >> (i * 8)) & 0xFF;
        // Make colors less saturated and brighter
        const adjustedValue = Math.min(200, Math.max(100, value)); 
        color += ('00' + adjustedValue.toString(16)).substr(-2);
    }
    return color;
};

// --- Helper function to get initials (from React component) ---
const getInitials = (name: string): string => {
    return name
        .split(' ')
        .map(word => word?.[0] || '') // Handle potential empty words
        .slice(0, 2) // Max 2 initials
        .join('')
        .toUpperCase();
};

// --- Helper function to format date/time (adapted from React component) ---
const formatChatTimestamp = (timestamp: string): string => {
    try {
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) {
            return timestamp;
        }

        const options: Intl.DateTimeFormatOptions = {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        };
        
        const formattedDate = date.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
        
        const formattedTime = date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        return `${formattedDate} at ${formattedTime}`;
    } catch (e) {
        console.warn(`Could not parse date: ${timestamp}`, e);
        return timestamp;
    }
};

const formatSeparatorTimestamp = (timestamp: string): string => {
    try {
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) return timestamp.split(', ')[0] || timestamp;
        
        // More robust date formatting for separators
        const options: Intl.DateTimeFormatOptions = {
            weekday: 'long', // e.g., Pazartesi
            year: 'numeric', 
            month: 'long', // e.g., Ocak
            day: 'numeric' 
        };
        return date.toLocaleDateString('tr-TR', options);
    } catch (e) {
        console.warn(`Could not parse separator date: ${timestamp}`, e);
        return timestamp.split(', ')[0] || timestamp;
    }
}

// Define the expected structure for a message in the request body
interface Message {
    timestamp: string;
    sender: string;
    content: string;
    // date & time are now derived inside helper functions
}

// Define the expected structure for the request body
interface ScreenshotRequestBody {
    messages: Message[];
    currentUser: string;
    contactName: string;
    location?: string; // Optional location from React component
    // chatBackgroundColor?: string; // Use fixed white background now
    // messageBackgroundColor?: string; // Defined in CSS
    // userMessageBackgroundColor?: string; // Defined in CSS
}

const app = express();
const port = process.env.PORT || 9090; 

app.use(express.json({ limit: '10mb' }));

// --- API Endpoint to Generate Screenshot ---
app.post('/api/screenshot', async (req: Request<{}, {}, ScreenshotRequestBody>, res: Response) => {
    const {
        messages,
        currentUser,
        contactName,
    } = req.body;

    if (!messages || !currentUser || !contactName) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    if (!Array.isArray(messages)) {
        return res.status(400).json({ success: false, message: 'Field \'messages\' must be an array.' });
    }

    console.log(`Received screenshot request for contact: ${contactName} with ${messages.length} messages.`);
    console.log('Launching browser...');

    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        // Disable cache
        await page.setCacheEnabled(false);

        const avatarColor = stringToColor(contactName);
        const avatarInitials = getInitials(contactName);
        const chatHtml = generateChatHtml(messages, currentUser, contactName);

        // Burada chat container'ın yüksekliğini auto yapıyoruz
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    /* Reset and Base Styles */
                    body { 
                        margin: 0; 
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                        -webkit-font-smoothing: antialiased;
                        background-color: #F2F2F7;
                    }

                    /* Chat Container */
                    .chat-container {
                        width: 390px;
                        background-color: #F2F2F7;
                        display: flex;
                        flex-direction: column;
                        position: relative;
                    }

                    /* iOS Status Bar */
                    .status-bar {
                        height: 44px;
                        background-color: #F2F2F7;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        padding: 0 16px;
                        font-size: 14px;
                        font-weight: 600;
                        color: #000;
                        position: sticky;
                        top: 0;
                        z-index: 100;
                    }
                    .status-bar-time {
                        position: absolute;
                        left: 50%;
                        transform: translateX(-50%);
                    }
                    .status-icons {
                        position: absolute;
                        right: 16px;
                        display: flex;
                        align-items: center;
                        gap: 4px;
                    }

                    /* Header */
                    .chat-header {
                        height: 52px;
                        background-color: #F2F2F7;
                        display: flex;
                        align-items: center;
                        padding: 4px 16px;
                        margin-bottom: 8px;
                        position: sticky;
                        top: 44px;
                        z-index: 100;
                    }
                    .back-button {
                        color: #007AFF;
                        font-size: 32px;
                        text-decoration: none;
                        margin-right: 4px;
                        line-height: 1;
                        font-weight: 300;
                    }
                    .avatar {
                        width: 36px;
                        height: 36px;
                        border-radius: 50%;
                        margin: 0 8px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-weight: 500;
                        font-size: 15px;
                        text-transform: uppercase;
                    }
                    .contact-name {
                        font-size: 17px;
                        font-weight: 600;
                        color: #000;
                    }

                    /* Messages Container */
                    .messages-container {
                        flex: 1;
                        padding: 0 8px 16px;
                        background-color: #F2F2F7;
                        display: flex;
                        flex-direction: column;
                        gap: 2px;
                    }

                    /* Message Bubbles */
                    .message-bubble {
                        max-width: 75%;
                        padding: 8px 12px;
                        margin: 1px 8px;
                        border-radius: 17px;
                        font-size: 17px;
                        line-height: 1.3125;
                        position: relative;
                    }
                    .message-bubble.sender {
                        background-color: #007AFF;
                        color: white;
                        align-self: flex-end;
                        margin-left: auto;
                        border-top-right-radius: 17px;
                        border-bottom-right-radius: 5px;
                    }
                    .message-bubble.contact {
                        background-color: #E9E9E9;
                        color: #000;
                        align-self: flex-start;
                        margin-right: auto;
                        border-top-left-radius: 17px;
                        border-bottom-left-radius: 5px;
                    }
                    .message-time {
                        font-size: 11px;
                        margin-top: 4px;
                        color: #8E8E93;
                        text-align: right;
                        position: absolute;
                        right: 12px;
                        bottom: -16px;
                    }
                    .message-bubble.sender .message-time {
                        color: #8E8E93;
                    }
                </style>
            </head>
            <body>
                <div class="chat-container" id="chat-to-capture">
                    <!-- iOS Status Bar -->
                    <div class="status-bar">
                        <div class="status-bar-time">14:33</div>
                        <div class="status-icons">
                            <svg width="18" height="12" viewBox="0 0 18 12" fill="black">
                                <path d="M1 4.5h2v3H1zM4.5 3h2v6h-2zM8 1.5h2v9H8zM11.5 0h2v12h-2zM15 2.5h2v7h-2z"/>
                            </svg>
                        </div>
                    </div>
                    
                    <!-- Header -->
                    <div class="chat-header">
                        <a href="#" class="back-button">‹</a>
                        <div class="avatar" style="background-color: ${avatarColor};">${avatarInitials}</div>
                        <div class="contact-name">${escapeHtml(contactName)}</div>
                    </div>
                    
                    <!-- Messages -->
                    <div class="messages-container">
                        ${chatHtml}
                    </div>
                </div>
            </body>
            </html>
        `;

        await page.setContent(htmlContent, { 
            waitUntil: ['networkidle0', 'load', 'domcontentloaded']
        });
        
        await page.waitForFunction(() => {
            const styles = window.getComputedStyle(document.body);
            return styles.backgroundColor !== '' && styles.fontFamily !== '';
        });

        // Set viewport width to 390px (standard iPhone width)
        const viewportWidth = 390;
        // Calculate 9:19 aspect ratio height
        const viewportHeight = Math.round((viewportWidth * 19) / 9); // ~823px
        
        console.log(`Using 9:19 aspect ratio: ${viewportWidth}x${viewportHeight}`);

        // Get the full height of the chat container
        const containerHeight = await page.evaluate(() => {
            const container = document.querySelector('#chat-to-capture');
            return container ? Math.ceil(container.getBoundingClientRect().height) : 0;
        });
        
        // Get the header height
        const headerHeight = await page.evaluate(() => {
            const header = document.querySelector('.status-bar, .chat-header');
            return header ? Math.ceil(header.getBoundingClientRect().height) : 0;
        });
        
        console.log(`Container height: ${containerHeight}px, Header height: ${headerHeight}px`);
        
        // Create directory for screenshots
        const screenshotDir = path.join(__dirname, '..', 'screenshots');
        if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir);
        }

        const timestamp = new Date().getTime();
        const sessionDir = path.join(screenshotDir, `${timestamp}`);
        fs.mkdirSync(sessionDir);

        // ADIM 1: Büyük bir ekran görüntüsü al
        await page.setViewport({
            width: viewportWidth,
            height: containerHeight,
            deviceScaleFactor: 1 // Daha küçük dosya boyutu için
        });
        
        const fullScreenshotPath = path.join(sessionDir, 'full.png');
        await page.screenshot({
            path: fullScreenshotPath,
            fullPage: true
        });
        
        // ADIM 2: Sharp ile görüntüyü 9:19 oranında parçalara böl
        const numChunks = Math.ceil((containerHeight - headerHeight) / viewportHeight) + 1;
        console.log(`Splitting into ${numChunks} chunks with ratio ${viewportWidth}x${viewportHeight}`);
        
        // İlk parça header ile
        try {
            console.log(`Creating chunk 1 with header`);
            await sharp(fullScreenshotPath)
                .extract({ 
                    left: 0, 
                    top: 0, 
                    width: viewportWidth, 
                    height: viewportHeight 
                })
                .toFile(path.join(sessionDir, '1.png'));
        } catch (error) {
            console.error("Error with sharp:", error);
            return res.status(500).json({ 
                success: false, 
                message: `Error slicing image: ${error instanceof Error ? error.message : String(error)}`
            });
        }
        
        // Sonraki parçalar header olmadan
        for (let i = 1; i < numChunks; i++) {
            const yOffset = (i * viewportHeight) - headerHeight;
            if (yOffset >= containerHeight) break;
            
            const chunkHeight = Math.min(viewportHeight, containerHeight - yOffset);
            if (chunkHeight <= 0) continue;
            
            console.log(`Creating chunk ${i+1}: y=${yOffset}, height=${chunkHeight}`);
            
            try {
                await sharp(fullScreenshotPath)
                    .extract({ 
                        left: 0, 
                        top: yOffset, 
                        width: viewportWidth, 
                        height: chunkHeight 
                    })
                    .toFile(path.join(sessionDir, `${i+1}.png`));
            } catch (error) {
                console.error(`Error creating chunk ${i+1}:`, error);
                // Hata alırsak işlemi durdurmak yerine devam edelim
                continue;
            }
        }
        
        // Orijinal dosyayı sil
        fs.unlinkSync(fullScreenshotPath);

        console.log(`Generated ${numChunks} screenshots in ${sessionDir}`);

        res.json({ 
            success: true,
            message: `Generated ${numChunks} screenshots`,
            directory: sessionDir,
            count: numChunks
        });

    } catch (error) {
        console.error('Error generating screenshots:', error);
        res.status(500).json({ success: false, message: `Error generating screenshots: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
        if (browser) {
            console.log('Closing browser...');
            await browser.close();
        }
    }
});

// --- Helper function to generate HTML for messages, mimicking React structure ---
function generateChatHtml(messages: Message[], currentUser: string, contactName: string): string {
    let html = '';
    let lastDateStr: string | null = null;

    messages.forEach((message, index) => {
        const date = new Date(message.timestamp.replace(/\./g, '/'));
        const currentDateStr = formatDate(date);
        
        // Add Date Separator if date changes
        if (currentDateStr !== lastDateStr) {
            html += `<div class="timestamp-separator">${currentDateStr}</div>`;
            lastDateStr = currentDateStr;
        }

        // Add Message Bubble
        const isSender = message.sender === currentUser;
        const bubbleClass = isSender ? 'sender' : 'contact';
        const time = date.toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        html += `
            <div class="message-bubble ${bubbleClass}">
                ${escapeHtml(message.content)}
                <div class="message-time">${time}</div>
            </div>
        `;
    });
    return html;
}

// Helper function to format date
function formatDate(date: Date): string {
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isYesterday = new Date(now.setDate(now.getDate() - 1)).toDateString() === date.toDateString();
    
    if (isToday) {
        return "Today";
    } else if (isYesterday) {
        return "Yesterday";
    } else {
        return date.toLocaleDateString('tr-TR', {
            day: 'numeric',
            month: 'numeric',
            year: 'numeric'
        });
    }
}

// --- Helper function to escape HTML characters ---
function escapeHtml(unsafe: string): string {
    if (!unsafe) return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 }

// --- Start the server ---
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    console.log(`API endpoint available at http://localhost:${port}/api/screenshot`);
});
