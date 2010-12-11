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

	// Preference branch for the extension:
	branch: null,

	// Preference listener:
	prefListener: null,

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

		// Update the gFindBar open and close methods:
		var methodstr = "";

		if(gFindBar)
		{
			if(gFindBar.open)
			{
				methodstr = gFindBar.open.toString();

				if(methodstr.indexOf("barlesque") == -1)
				{
					methodstr = methodstr.substr(methodstr.indexOf("{") + 1);
					methodstr = "function(aMode) { if(barlesque) { if(barlesque.branch.getBoolPref('findmode')) { barlesque.resetStyles(true); } else { document.getElementById('addon-bar').hidden = true; window.removeEventListener('resize', barlesque.doReset, false); barlesque.removeStyles(); } } " + methodstr;

					new Function("gFindBar.open = " + methodstr)();
				}
			}

			if(gFindBar.close)
			{
				methodstr = gFindBar.close.toString();

				if(methodstr.indexOf("barlesque") == -1)
				{
					methodstr = methodstr.substring(0, methodstr.lastIndexOf("}") - 1);
					methodstr += " if(barlesque) { if(barlesque.branch.getBoolPref('findmode')) { barlesque.resetStyles(); } else { document.getElementById('addon-bar').hidden = false; barlesque.resetStyles(); window.addEventListener('resize', barlesque.doReset, false); } } }";

					new Function("gFindBar.close = " + methodstr)();
				}
			}
		}

		// Update the onViewToolbarCommand method (handler for multiple show/hide items in View -> Toolbars):
		if(onViewToolbarCommand)
		{
			methodstr = onViewToolbarCommand.toString();

			if(methodstr.indexOf("barlesque") == -1)
			{
				methodstr = methodstr.substring(0, methodstr.lastIndexOf("}") - 1);
				methodstr += "if(toolbarId == 'addon-bar') { if(barlesque) { barlesque.resetStyles(); } } }";

				new Function("onViewToolbarCommand = " + methodstr)();
			}
		}

		// Initialize tab selection event:
		gBrowser.tabContainer.addEventListener("TabSelect", this.doReset, false);

		// Initialize page load event:
		window.addEventListener("DOMContentLoaded", this.doReset, false);

		// Browser notification event:
		window.addEventListener("AlertActive", this.doReset, false);

		// Initialize resize event, deferred to reduce browser startup time:
		var self = this;

		setTimeout(function()
		{
			window.addEventListener("resize", self.doReset, false);

			// First round of style change:
			self.doReset();
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

		window.removeEventListener("DOMContentLoaded", this.doReset, false);
		window.removeEventListener("resize", this.doReset, false);

		gBrowser.tabContainer.removeEventListener("TabSelect", this.doReset, false);
	},

	// Wrapper for bottom bar style reset:
	doReset: function(event)
	{
		if(event && (event.type == "DOMContentLoaded"))
		{
			// Current and top-level document only:
			var doc = event.target;

			if(doc == gBrowser.contentDocument)
			{
				if(gFindBar.hidden || barlesque.branch.getBoolPref("findmode"))
				{
					barlesque.resetStyles();
				}
			}
		}
		else
		{
			if(gFindBar.hidden || barlesque.branch.getBoolPref("findmode"))
			{
				barlesque.resetStyles();
			}
		}
	},

	// Method that actually affects the addon bar:
	resetStyles: function(findbarShowing)
	{
		this.removeCollapser();

		var addonbar = document.getElementById("addon-bar");

		// Don't proceed if add-on bar is hidden:
		if(addonbar.collapsed === true)
		{
			return;
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

		// Don't proceed if there are no elements to show:
		if(count === 0)
		{
			addonbar.hidden = true;
			return;
		}

		var collapsed = this.branch.getBoolPref("collapsed") || (!gFindBar.hidden && !this.branch.getBoolPref("findmode"));
		addonbar.hidden = collapsed;

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
		if((!gFindBar.hidden || findbarShowing) && this.branch.getBoolPref("findmode"))
		{
			abclasses.push("barlesque-bar");
			abclasses.push("barlesque-right");

			if(vscroll)
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

		// position: fixed; bottom: 0px; right: 0px; background: none; border: 0px;

		if(gFindBar.hidden)
		{
			// Notification box for currently shown browser:
			var nb = gBrowser.getNotificationBox(gBrowser.selectedTab.linkedBrowser);
			var height = 0;

			// NoScript?
			if(nb && nb._noscriptPatched && nb._noscriptBottomStack_)
			{
				height = nb._noscriptBottomStack_.clientHeight;
			}

			// Modify the position of bottom box:
			bottombox.style.bottom = ((hscroll ? 15 : 0) + height) + "px";
		}

		// Append the collapser:
		if(this.branch.getBoolPref("collapser") && !document.getElementById("barlesque-collapser"))
		{
			var collapser = document.createElement("box");
			collapser.id = "barlesque-collapser";
			collapser.setAttribute("tooltiptext", collapsed ? "Show the add-on bar" : "Collapse the add-on bar");

			if(gFindBar.hidden)
			{
				bottombox.appendChild(collapser);
			}
			else
			{
				if(this.branch.getBoolPref("findmode"))
				{
					if(collapsed)
					{
						// Create a special container for collapser icon.
					}
					else
					{
						addonbar.appendChild(collapser);
					}

					// Here we must check if add-on bar is hidden.
				}
			}

			// Attach event handler:
			collapser.addEventListener("click", function() { barlesque.branch.setBoolPref("collapsed", !barlesque.branch.getBoolPref("collapsed")); barlesque.resetStyles(); }, false);
		}
	},

	// Completely remove barlesque styles from bottom bar:
	removeStyles: function()
	{
		this.removeCollapser();

		// Current classes of bottom toolbar:
		var bar = document.getElementById("browser-bottombox");
		var classes = bar.className.length ? bar.className.split(" ") : [];

		// Remove old barlesque classes, if any:
		for(var i = 0; i < classes.length; i++)
		{
			if(classes[i].indexOf("barlesque-") === 0)
			{	
				classes.splice(i--, 1);
			}
		}

		// Assign clean set of classes:
		bar.className = !classes.length ? "barlesque-empty-class" : classes.join(" ");
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

	// Recreate shortcut elements:

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
	}
};

window.addEventListener("load",   function() { barlesque.init();   }, false);
window.addEventListener("unload", function() { barlesque.uninit(); }, false);