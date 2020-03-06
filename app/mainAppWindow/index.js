
const { shell, ipcMain, BrowserWindow } = require('electron');
const windowStateKeeper = require('electron-window-state');
const path = require('path');
const login = require('../login');
const iconPath = path.join(__dirname, '..', 'assets', 'icons', 'icon-96x96.png');
const customCSS = require('../customCSS');
const Menus = require('../menus');
const notifications = require('../notifications');
const onlineOffline = require('../onlineOffline');

let aboutBlankRequestCount = 0;

let window = null;

exports.onAppReady = function onAppReady() {
	window = createWindow();

	// ipcMain.on('captureScreen', (event, filename) => {
	// 	console.log('captureScreen called', event, filename);
	// 	// let screenCaptureProvider = module.require('./screenCaptureProvider');
    //     // screenCaptureProvider.getScreenCapture(filename, true)
    //     //     .catch(() => {
    //     //         this._loggingService.logError('Error capturing screen');
    //     //     });
	// });

	// ipcMain.on('setSkypeCookie', (event, skypeCookie) => {
    //     try {
    //         window.webContents.session.cookies.set({ url: 'https://api.asm.skype.com', domain: '.asm.skype.com', name: 'skypetoken_asm', value: skypeCookie },
    //             (error, cookies) => {
    //                 if (error) {
    //                     // TODO sanitize log and error
    //                     console.error('Error saving cookie');
    //                 };
    //             });
    //     } catch (e) {
    //         // TODO sanitize log and error
    //         console.error('Unable set cookie due to error');
    //     }
    // });

	window.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
		console.log('did-fail-load', event, errorCode, errorDescription, validatedURL, isMainFrame);
	});

	new Menus(window, config, iconPath);

	// window.webContents.on('ipc-message', (...args) => console.log(args));
	// window.webContents.on('ipc-message-sync', (...args) => console.log(args));
	// window.webContents.on('desktop-capturer-get-sources', (...args) => console.log(args));

	window.on('page-title-updated', (event, title) => {
		window.webContents.send('page-title', title);
	});

	if (config.enableDesktopNotificationsHack) {
		notifications.addDesktopNotificationHack(iconPath);
	}

	window.webContents.on('new-window', onNewWindow);

	// window.webContents.session.webRequest.onBeforeRequest(['http*'], onBeforeRequestHandler);

	login.handleLoginDialogTry(window);
	if (config.onlineOfflineReload) {
		onlineOffline.reloadPageWhenOfflineToOnline(window, config.url);
	}

	window.webContents.setUserAgent(config.chromeUserAgent);

	if (!config.minimized) {
		window.once('ready-to-show', () => window.show());
	}

	window.webContents.on('did-finish-load', () => {
		customCSS.onDidFinishLoad(window.webContents);
	});

	window.on('close', () => {
		console.log('window close');
		window.webContents.session.flushStorageData();
	})
	window.on('closed', () => {
		console.log('window closed');
		window = null;
	});

	url = processArgs(process.argv)
	window.loadURL( url ? url:config.url);

	if (config.webDebug) {
		window.openDevTools();
	}
}

exports.onAppSecondInstance = function onAppSecondInstance(event, args) {
	console.log('second-instance started');
	if (window) {
		event.preventDefault();
		url = processArgs(args)
		if (url) {
			window.loadURL(url)
		} else {
			if (window.isMinimized()) window.restore();
			window.focus();
		}
	}
}

function processArgs(args) {
	console.debug("processArgs", args);
	for (const arg of args) {
		if (arg.startsWith('https://teams.microsoft.com/l/meetup-join/')) {
			console.log('meetup-join argument received with https protocol');
			window.show()
			return arg
		}
		if (arg.startsWith('msteams:/l/meetup-join/')) {
			console.log('meetup-join argument received with msteams protocol');
			window.show()
			pathMeetup = arg.substring(8, arg.length)
			url = config.url + pathMeetup
			return url
		}
	}
}

function onBeforeRequestHandler(details, callback) {
	// Check if the counter was incremented
	if (aboutBlankRequestCount < 1) {
		// Proceed normally
		callback({});
	} else {
		// Open the request externally
		console.debug('DEBUG - webRequest to  ' + details.url + ' intercepted!');
		shell.openExternal(details.url);
		// decrement the counter
		aboutBlankRequestCount -= 1;
		callback({ cancel: true });
	}
}

function onNewWindow(event, url, frame, disposition, options) {
	if (url.startsWith('https://teams.microsoft.com/l/meetup-join')) {
		event.preventDefault();
	} else if (url === 'about:blank') {
		event.preventDefault();
		// Increment the counter
		aboutBlankRequestCount += 1;
		// Create a new hidden window to load the request in the background
		console.debug('DEBUG - captured about:blank');
		const win = new BrowserWindow({
			webContents: options.webContents, // use existing webContents if provided
			show: false
		});

		// Close the new window once it is done loading.
		win.once('ready-to-show', () => win.close());

		event.newGuest = win;
	} else if (disposition !== 'background-tab') {
		event.preventDefault();
		shell.openExternal(url);
	}
};

function createWindow() {
	// Load the previous state with fallback to defaults
	const windowState = windowStateKeeper({
		defaultWidth: 0,
		defaultHeight: 0,
	});

	// Create the window
	const window = new BrowserWindow({
		x: windowState.x,
		y: windowState.y,

		width: windowState.width,
		height: windowState.height,
		backgroundColor: '#fff',

		show: false,
		autoHideMenuBar: true,
		icon: iconPath,

		webPreferences: {
			partition: config.partition,
			preload: path.join(__dirname, '..', 'browser', 'index.js'),
			nativeWindowOpen: true,
			plugins: false, // true
			nodeIntegration: false,
			webSecurity: true, // none
			nodeIntegrationInWorker: true,
			// sandbox: false
		},
	});

	windowState.manage(window);
	window.eval = global.eval = function () { // eslint-disable-line no-eval
		throw new Error('Sorry, this app does not support window.eval().');
	};

	return window;
}
