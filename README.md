# Jellyfin NFC Bridge

A simple Node.js web server to trigger Jellyfin playback via simple URLs, making it perfect for use with NFC tags. Manage your movies and music albums through a clean web interface and assign them to different playback devices.

This application acts as a bridge between a simple HTTP GET request (like one triggered by an NFC tag) and your Jellyfin server.

The core idea is to map a media item (like a movie or a music album) to a simple, memorable **trigger word**. When you visit the URL `http://<your-server-ip>/<triggerword>`, the server sends a command to a pre-selected Jellyfin client, telling it to play that specific media.

## ✨ Features

  * **Web-based UI:** Easy-to-use interface to manage your media triggers.
  * **Jellyfin Library Search:** Search for movies and music albums directly from the UI.
  * **Simple Trigger Mechanism:** Works with any device that can make an HTTP request, including NFC tags, shortcuts, and bookmarks.

-----

## 🔧 Installation & Setup

Follow these steps to get the Jellyfin NFC Bridge up and running.

### Prerequisites

  * **Node.js:** You must have Node.js and `npm` installed. You can download it from [nodejs.org](https://nodejs.org/).
  * **Jellyfin Server:** A running instance of Jellyfin that you can access from the machine where you'll run this server.
  * **Jellyfin API Key:** You'll need an API key from your Jellyfin server. You can generate one in your Jellyfin Dashboard under `API Keys`.

### Step-by-Step Instructions

1.  **Download the Code:**
    Save the provided `server.js` and  `settings.json` file into a new folder on your computer or server.

2.  **Install Dependencies:**
    Open a terminal or command prompt, navigate to the folder where you saved `server.js`, and run the following command to install the necessary libraries:

    ```bash
    npm install express axios better-sqlite3
    ```

3.  **Edit the Configuration File:**
    Edit the file named `settings.json`.

    ```json
    {
      "jellyfinBaseUrl": "http://192.168.1.100:8096",
      "apiKey": "YOUR_JELLYFIN_API_KEY_HERE",
      "targetUsername": "YOUR_JELLYFIN_USERNAME"
    }
    ```

      * `jellyfinBaseUrl`: The full URL to your Jellyfin server.
      * `apiKey`: The API key you generated in the Jellyfin dashboard.
      * `targetUsername`: The Jellyfin user whose library you want to search.

4.  **Run the Server:**
    Start the application by running this command in your terminal:

    ```bash
    node server.js
    ```

    You should see a message confirming that the server is running on port 80.

-----

## 🚀 Usage Guide

Once the server is running, you can manage everything from your web browser.

1.  **Access the Web UI:**
    Open your web browser and navigate to the IP address of the machine running the server (e.g., `http://192.168.1.100`).

2.  **Set Your Active Devices (Most Important Step\!):**

      * Before you can play anything, you must tell the server which devices to use.
      * **Make sure your target Jellyfin clients (e.g., Jellyfin Media Player on your TV, Finamp on your phone) are open and running.**
      * Click the **Change Active Device** button.
      * You will see a list of all active Jellyfin sessions.
      * For the device you want to play movies on, click the **"For Movies"** button.
      * For the device you want to play music on, click the **"For Music"** button.
      * You will be redirected back to the main page, where your selected devices will now be shown at the top.

3.  **Add a Movie or Album:**

      * Use the search bar under the "Movies" or "Albums" section to find media from your Jellyfin library.
      * On the search results page, find the correct item.
      * Enter a simple, one-word, lowercase **Trigger Word** (e.g., `inception`). This is the word you will use in the URL.
      * Click **"Add to Database"**.

4.  **Trigger Playback:**
    You're all set\! To start playback, simply access the URL with your trigger word. For example, if your server is at `192.168.1.100` and your trigger word is `inception`, you would use:

    ```
    http://192.168.1.100/inception
    ```

    You can write this URL to an NFC tag, create a bookmark, or use it in any shortcut application. When triggered, the movie will begin playing on your designated "Movie" device.
