/*
   Copyright 2010 Dmitriy Khudorozhkov. All rights reserved.

   Permission is hereby granted, free of charge, to any person obtaining a copy
   of this software and associated documentation files (the "Software"), to deal
   in the Software without restriction, including without limitation the rights
   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   copies of the Software, and to permit persons to whom the Software is
   furnished to do so, subject to the following conditions:

   The above copyright notice and this permission notice shall be included in
   all copies or substantial portions of the Software.

   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   THE SOFTWARE.
*/

var barlesque = {

	// Shortcuts:
	Cc: Components.classes,
	Ci: Components.interfaces,
	Cu: Components.utils,

	// Preference branch for the extension:
	branch: null,

	// Preference listener:
	prefListener: null,

	// Auto-collapsing timer:
	timer: null,

	// Is user currently customizing the add-on bar?
	customizing: false,

	// Initialization:
	init: function()
	{
		// Initialize preferences:
		var prefservice = this.Cc["@mozilla.org/preferences-service;1"].getService(this.Ci.nsIPrefService);
		this.branch = prefservice.getBranch("extensions.barlesque.");

		// Correct the preferences:
		if(!this.branch.getBoolPref("persist"))
		{
			this.branch.setBoolPref("collapsed", false);
		}

		// Initialize preference change listener:
		this.initPrefListener();

		// Initialize the keyboard shortcuts:
		this.rekeyHide();
		this.rekeyMove();

		/* Wrap gFindBar's open and close methods with Barlesque's custom handlers: */
		var self = this;

		if(gFindBar)
		{
			if(gFindBar.open)
			{
				let _oldOpen = gFindBar.open;

				gFindBar.open = function()
				{
					try
					{
						self.openFindBar();
					}
					catch(ex)
					{
						self.Cu.reportError(ex);
					}

					return _oldOpen.apply(gFindBar, arguments);
				};
			}

			if(gFindBar.close)
			{
				let _oldClose = gFindBar.close;

				gFindBar.close = function()
				{
					try
					{
						self.closeFindBar();
					}
					catch(ex)
					{
						self.Cu.reportError(ex);
					}

					return _oldClose.apply(gFindBar, arguments);
				};
			}
		}

		/* Wrap onViewToolbarCommand method (handler for multiple show/hide items in View -> Toolbars) with Barlesque's custom handler: */
		if(onViewToolbarCommand)
		{
			let _oldViewToolbarCommand = onViewToolbarCommand;

			onViewToolbarCommand = function()
			{
				let rv = _oldViewToolbarCommand.apply(null, arguments);

				try
				{
					self.onViewToolbarCommand.apply(self, arguments);
				}
				catch(ex)
				{
					self.Cu.reportError(ex);
				}

				return rv;
			};
		}

		// Initialize tab selection event:
		gBrowser.tabContainer.addEventListener("TabSelect", this.doReset, false);

		// Initialize page load event:
		window.addEventListener("DOMContentLoaded", this.doReset, false);

		// Browser notification event:
		window.addEventListener("AlertActive", this.doReset, false);

		// Customization events:
		window.addEventListener("beforecustomization", this.customizationStarted, false);  
		window.addEventListener("aftercustomization", this.doReset, false);  

		// Initialize resize event, deferred to reduce browser startup time:
		setTimeout(function()
		{
			window.addEventListener("resize", self.doReset, false);

			// Timer events:
			self.attachTimerEvents(document.getElementById("addon-bar"));

			// First round of style change:
			self.doReset();

			// Auto-collapse timer:
			self.startTimer();
		},
		200);
	},

	// Startup of preference listener:
	initPrefListener: function()
	{
		var self = this;

		// Listener object:
		function prefChangedListener(branch, callback)
		{
			branch.QueryInterface(self.Ci.nsIPrefBranch2);
			branch.addObserver("", this, false);

			this.observe = function(subject, topic, data)
			{
				// Only track change events:
				if(topic == "nsPref:changed")
				{
					callback(branch, data);
				}
			};

			this.unregister = function()
			{
				if(branch)
				{
					branch.removeObserver("", this);
				}
			};
		}

		// Listener callback:
		function listenerCallback(branch, name)
		{
			switch(name)
			{
				case "timed":
					// Auto-collapse timer was switched on/off:

					// Stop existing timer, if any:
					self.stopTimer();

					// Restart, if needed:
					self.startTimer();

					break;

				case "timer":
					// Auto-collapse timeout was changed:

					// Restart the timer:
					self.startTimer();
					break;

				case "collapser":
				case "findmode":
				case "mode":
					self.resetStyles();
					break;

				case "shorthide.key":
				case "shorthide.mod":
					self.rekeyHide();
					break;

				case "shortmove.key":
				case "shortmove.mod":
					self.rekeyMove();
					break;
			}
		}

		// Initialize:
		this.prefListener = new prefChangedListener(this.branch, listenerCallback);
	},

	// Shutdown:
	uninit: function()
	{
		this.prefListener.unregister();

		window.removeEventListener("resize", this.doReset, false);
		window.removeEventListener("aftercustomization", this.doReset, false);
		window.removeEventListener("beforecustomization", this.customizationStarted, false);
		window.removeEventListener("AlertActive", this.doReset, false);
		window.removeEventListener("DOMContentLoaded", this.doReset, false);
		gBrowser.tabContainer.removeEventListener("TabSelect", this.doReset, false);
	},

	/* Custom handler for find bar's open event: */
	openFindBar: function()
	{
		if(this.branch.getIntPref("findmode") != 0)
		{
			this.resetStyles(true);
		}
		else
		{
			document.getElementById("addon-bar").hidden = true;
			window.removeEventListener("resize", this.doReset, false);
			this.removeStyles();
		}
	},

	/* Custom handler for find bar's close event: */
	closeFindBar: function()
	{
		if(this.branch.getIntPref("findmode") != 0)
		{
			this.resetStyles();
		}
		else
		{
			document.getElementById("addon-bar").hidden = false;
			window.addEventListener("resize", this.doReset, false);
			this.resetStyles();
		}
	},

	/* Custom handler for turning the add-on bar on/off: */
	onViewToolbarCommand: function(event)
	{
		let toolbarId = event.originalTarget.getAttribute("toolbarId");

		if(toolbarId != "addon-bar")
		{
			return;
		}

		this.resetStyles();
	},

	// Wrapper for event handling:
	doReset: function(event)
	{
		if(event && (event.type == "DOMContentLoaded"))
		{
			// Current and top-level document only:
			var doc = event.target;

			if(doc == gBrowser.contentDocument)
			{
				if(gFindBar.hidden || (barlesque.branch.getIntPref("findmode") != 0))
				{
					barlesque.resetStyles();
				}
			}
		}
		else
		{
			if(event && (event.type != "aftercustomization") && barlesque.customizing)
			{
				return;
			}

			if(gFindBar.hidden || (barlesque.branch.getIntPref("findmode") != 0))
			{
				barlesque.resetStyles();
			}
		}
	},

	// Method that actually affects the add-on bar:
	resetStyles: function(findbarShowing)
	{
		this.customizing = false;
		this.removeCollapser();

		var addonbar = document.getElementById("addon-bar");
		addonbar.removeEventListener("DOMSubtreeModified", this.reappear, false);

		// Don't proceed if add-on bar is hidden by the user:
		if(addonbar.collapsed === true)
		{
			return;
		}

		if(addonbar.hasAttribute("moz-collapsed"))
		{
			addonbar.removeAttribute("moz-collapsed");
		}

		// Count the number of visible elements in add-on bar/status bar:
		var count = 0;
		var buttons = addonbar.childNodes;

		for(var i = 0, l = buttons.length; i < l; i++)
		{
			var button = buttons[i];
			var tag = button.tagName.toLowerCase();
			var isItem = (tag == "toolbaritem");

			if((isItem || (tag == "toolbarbutton")) && (window.getComputedStyle(button).getPropertyValue("display") != "none"))
			{
				++count;
			}

			// Meanwhile, check if any toolbaritem has width attribute. Replace it with min-width:
			if(isItem)
			{
				if(button.hasAttribute("width"))
				{
					button.setAttribute("min-width", button.getAttribute("width"));
					button.removeAttribute("width");
				}
			}
		}

		if(gFindBar.hidden || !findmode)
		{
			var statusbar = document.getElementById("status-bar");

			if(statusbar)
			{
				var panels = statusbar.getElementsByTagName("statusbarpanel");

				for(i = 0, l = panels.length; i < l; i++)
				{
					var panel = panels[i];

					if((panel.className.indexOf("statusbar-resizerpanel") == -1) && (window.getComputedStyle(panel).getPropertyValue("display") != "none"))
					{
						++count;
					}
				}
			}
		}

		// Don't proceed if there are no elements to show:
		if(count === 0)
		{
			addonbar.hidden = true;
			return;
		}

		var findmode = this.branch.getIntPref("findmode");

		// Download Statusbar - see if it exists:
		var dls = document.getElementById("downbarHolder");

		if(dls)
		{
			// Reattach to add-on bar:
			addonbar.appendChild(dls);
		}

		var collapsed = this.branch.getBoolPref("collapsed") || (!gFindBar.hidden && !findmode);

		if(!gFindBar.hidden && findmode)
		{
			addonbar.hidden = false;
			addonbar.style.display = collapsed ? "none" : "block";
		}
		else
		{
			addonbar.style.display = "";
			addonbar.hidden = collapsed;
		}

		// Current window:
		var win = gBrowser.contentWindow;

		// Does currently shown browser have a vertical scroll bar?
		var vscroll = (win.scrollMaxY !== 0);

		// Does currently shown browser have a horizontal scroll bar?
		var hscroll = (win.scrollMaxX !== 0);

		// Current classes of add-on bar and bottom box:
		var bottombox = document.getElementById("browser-bottombox");
		var abclasses = addonbar.className.length ? addonbar.className.split(" ") : [];
		var bbclasses = bottombox.className.length ? bottombox.className.split(" ") : [];

		// Remove old barlesque classes, if any:
		for(i = 0; i < abclasses.length; i++)
		{
			if(abclasses[i].indexOf("barlesque-") === 0)
			{
				abclasses.splice(i--, 1);
			}
		}

		for(i = 0; i < bbclasses.length; i++)
		{
			if(bbclasses[i].indexOf("barlesque-") === 0)
			{	
				bbclasses.splice(i--, 1);
			}
		}

		addonbar.style.bottom = "";
		bottombox.style.bottom = "";

		if(gFindBar.hidden && !findbarShowing)
		{
			// Current aligning mode:
			var mode = this.branch.getBoolPref("mode");

			// New classes:
			bbclasses.push("barlesque-bar");
			bbclasses.push("barlesque-" + (mode ? "left" : "right"));

			if(!mode && vscroll)
			{
				bbclasses.push("barlesque-vscroll");
			}

			if(hscroll)
			{
				bbclasses.push("barlesque-hscroll");
			}

			if(collapsed)
			{
				bbclasses.push("barlesque-collapsed");
			}
		}

		// Assign new set of classes:
		if(bbclasses.length)
		{
			bottombox.className = bbclasses.join(" ");
		}
		else
		{
			bottombox.removeAttribute("class");
		}

		// Overlay the add-on bar over the find bar if appropriate option is selected:
		if((!gFindBar.hidden || findbarShowing) && findmode)
		{
			abclasses.push("barlesque-bar");
			abclasses.push("barlesque-right");

			if(vscroll && (findmode == 2))
			{
				abclasses.push("barlesque-vscroll");
			}

			if(collapsed)
			{
				abclasses.push("barlesque-collapsed");
			}
		}

		if(abclasses.length)
		{
			addonbar.className = abclasses.join(" ");
		}
		else
		{
			addonbar.removeAttribute("class");
		}

		if(gFindBar.hidden)
		{
			// Notification box for currently shown browser:
			var height = (hscroll ? 16 : 0);

			// Modify the position of bottom box:
			bottombox.style.bottom = height + this.getNoScriptNotificationHeight() + "px";
		}
		else if(findmode == 2)
		{
			var height = document.getElementById("FindToolbar").scrollHeight + (hscroll ? 16 : 0);

			addonbar.style.bottom = height + this.getNoScriptNotificationHeight() + "px";
		}

		// Specifically target the refcontrol extension:
		var refcontrol = document.getElementById("refcontrol-status");

		// Append the collapser:
		if(this.branch.getBoolPref("collapser") && !document.getElementById("barlesque-collapser"))
		{
			var collapser = document.createElement("box");
			collapser.id = "barlesque-collapser";

			if(gFindBar.hidden)
			{
				bottombox.appendChild(collapser);

				if(refcontrol)
				{
					refcontrol.hidden = false;
				}
			}
			else
			{
				if(findmode)
				{
					if(collapsed)
					{
						document.getElementById("FindToolbar").appendChild(collapser);
					}
					else
					{
						addonbar.appendChild(collapser);

						if(refcontrol)
						{
							refcontrol.hidden = true;
						}
					}
				}
			}

			collapser.setAttribute("tooltiptext", (collapsed ? "Show" : "Collapse") + " the add-on bar");

			// Attach event handlers:

			collapser.addEventListener("click", function(event)
			{
				// Don't react to right-click:
				if(event.which && (event.which == 3))
				{
					return;
				}

				barlesque.branch.setBoolPref("collapsed", !barlesque.branch.getBoolPref("collapsed"));
				barlesque.resetStyles();
			},
			false);

			this.attachTimerEvents(collapser);
		}

		// Make the add-on bar reappear when notifications occur:
		if(collapsed)
		{
			addonbar.addEventListener("DOMSubtreeModified", this.reappear, false);
		}
	},

	// Wrapper for the removeStyles method - called when user starts customizing the UI:
	customizationStarted: function(event)
	{
		barlesque.customizing = true;

		if(event && event.type == "beforecustomization")
		{
			// Download Statusbar: see if it exists:
			var dls = document.getElementById("downbarHolder");

			if(dls)
			{
				// Reattach to the bottom box:
				document.getElementById("browser-bottombox").appendChild(dls);
			}
		}

		barlesque.removeStyles();
	},

	// Completely remove barlesque styles from bottom bar:
	removeStyles: function()
	{
		var addonbar = document.getElementById("addon-bar")
		addonbar.removeEventListener("DOMSubtreeModified", this.reappear, false);

		this.removeCollapser();

		// Current classes of bottom toolbar:
		var bottombox = document.getElementById("browser-bottombox");
		var bbclasses = bottombox.className.length ? bottombox.className.split(" ") : [];

		// Remove old barlesque classes, if any:
		for(var i = 0; i < bbclasses.length; i++)
		{
			if(bbclasses[i].indexOf("barlesque-") === 0)
			{	
				bbclasses.splice(i--, 1);
			}
		}

		// Assign clean set of classes:
		if(bbclasses.length)
		{
			bottombox.className = bbclasses.join(" ");
		}
		else
		{
			bottombox.removeAttribute("class");
		}

		// Same for add-on bar:
		var abclasses = addonbar.className.length ? addonbar.className.split(" ") : [];

		for(var i = 0; i < abclasses.length; i++)
		{
			if(abclasses[i].indexOf("barlesque-") === 0)
			{	
				abclasses.splice(i--, 1);
			}
		}

		if(abclasses.length)
		{
			addonbar.className = abclasses.join(" ");
		}
		else
		{
			addonbar.removeAttribute("class");
		}
	},

	// Remove the collapser box:
	removeCollapser: function()
	{
		var collapser = document.getElementById("barlesque-collapser");

		if(collapser)
		{
			collapser.parentNode.removeChild(collapser);
		}
	},

	// Height of NoScript notification bar:
	getNoScriptNotificationHeight: function()
	{
		// Notification box for currently shown browser:
		var nb = gBrowser.getNotificationBox(gBrowser.selectedTab.linkedBrowser);

		// NoScript?
		if(nb && nb._noscriptPatched && nb._noscriptBottomStack_)
		{
			return nb._noscriptBottomStack_.clientHeight;
		}

		return 0;
	},

	// Recreate keyboard shortcut elements:

	// - for add-on bar hiding/showing:
	rekeyHide: function()
	{
		// This and the following function uses a hack to make
		// Mozilla understand new shortcuts without app restart
		// by creating a new keyset element.

		var win = document.getElementById("main-window");
		var keyset = document.getElementById("barlesque-shorthide-keyset");

		if(keyset)
		{
			win.removeChild(keyset);
		}

		keyset = document.createElement("keyset");
		keyset.id = "barlesque-shorthide-keyset";
		win.appendChild(keyset);

		var shorthide = document.createElement("key");
		shorthide.id = "barlesque-shorthide";

		shorthide.setAttribute("key", this.branch.getCharPref("shorthide.key"));
		shorthide.setAttribute("modifiers", this.branch.getCharPref("shorthide.mod"));
		shorthide.setAttribute("command", "barlesque-command-shorthide");

		keyset.appendChild(shorthide);
	},

	// - for add-on bar re-aligning:
	rekeyMove: function()
	{
		var win = document.getElementById("main-window");
		var keyset = document.getElementById("barlesque-shortmove-keyset");

		if(keyset)
		{
			win.removeChild(keyset);
		}

		keyset = document.createElement("keyset");
		keyset.id = "barlesque-shortmove-keyset";
		win.appendChild(keyset);

		var shortmove = document.createElement("key");
		shortmove.id = "barlesque-shortmove";

		shortmove.setAttribute("key", this.branch.getCharPref("shortmove.key"));
		shortmove.setAttribute("modifiers", this.branch.getCharPref("shortmove.mod"));
		shortmove.setAttribute("command", "barlesque-command-shortmove");

		keyset.appendChild(shortmove);
	},

	// Timer methods:

	stopTimer: function()
	{
		if(this.timer)
		{
			clearTimeout(this.timer);
			this.timer = null;
		}
	},

	startTimer: function()
	{
		if(!this.branch.getBoolPref("timed"))
		{
			return;
		}

		this.stopTimer();

		var self = this;

		this.timer = setTimeout(function()
		{
			self.branch.setBoolPref("collapsed", true);
			self.resetStyles();
		},
		this.branch.getIntPref("timer") * 1000);
	},

	attachTimerEvents: function(node)
	{
		var self = this;

		if(node && node.addEventListener)
		{
			node.addEventListener("mouseover", function() { self.stopTimer();  }, false);
			node.addEventListener("mouseout",  function() { self.startTimer(); }, false);
		}
	},

	// Callback for add-on bar elements' notification events:
	reappear: function(event)
	{
		if(event.target.id != "addon-bar")
		{
			barlesque.branch.setBoolPref("collapsed", false);
			barlesque.resetStyles();
			barlesque.startTimer();
		}
	}
};

// Extension (un)initialization:
window.addEventListener("load", function()
{
	window.removeEventListener("load", arguments.callee, false);

	try
	{
		barlesque.init();
	}
	catch(ex)
	{
		barlesque.Cu.reportError(ex);
	}
},
false);

window.addEventListener("unload", function()
{
	window.removeEventListener("unload", arguments.callee, false);
	barlesque.uninit();
},
false);