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
		// Update the gFindBar open and close methods:
		var methodstr = gFindBar.open.toString();
		if(methodstr.indexOf("barlesque") == -1)
		{
			methodstr = methodstr.substr(methodstr.indexOf("{") + 1);
			methodstr = "function(aMode) { document.getElementById('addon-bar').hidden = true; if(barlesque) { window.removeEventListener('resize', barlesque.doReset, false); barlesque.removeStyles(); } " + methodstr;

			new Function("gFindBar.open = " + methodstr)();
		}

		methodstr = gFindBar.close.toString();
		if(methodstr.indexOf("barlesque") == -1)
		{
			methodstr = methodstr.substring(0, methodstr.lastIndexOf("}") - 1);
			methodstr += "document.getElementById('addon-bar').hidden = false; if(barlesque) { barlesque.resetStyles(); window.addEventListener('resize', barlesque.doReset, false); } }";

			new Function("gFindBar.close = " + methodstr)();
		}

		// Initialize preferences:
		var prefservice = this.Cc["@mozilla.org/preferences-service;1"].getService(this.Ci.nsIPrefService);
		this.branch = prefservice.getBranch("extensions.barlesque.");

		// Initialize preference change listener:
		this.initPrefListener();

		// Initialize page events:
		window.addEventListener("DOMContentLoaded", this.doReset, false);
		window.addEventListener("resize", this.doReset, false);

		// Initialize tab selection event:
		gBrowser.tabContainer.addEventListener("TabSelect", this.doReset, false);

		// First round of style change:
		this.resetStyles();
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

			branch.getChildList("", { }).forEach(function(name) { callback(branch, name); });

			this.unregister = function()
			{
				if(branch)
				{
					branch.removeObserver("", this);
				}
			};

			this.observe = function(subject, topic, data)
			{
				// Only track change events:
				if(topic == "nsPref:changed")
				{
					callback(branch, data);
				}
			};
		}

		// Listener callback (note that it called not only on
		// preference change, but also on the browser startup):
		function listenerCallback(branch, name)
		{
			self.resetStyles();
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

	doReset: function(event)
	{
		barlesque.resetStyles();
	},

	// Method that actually changes addon bar's class:
	resetStyles: function()
	{
		// Couple of shortcuts:
		var browser = gBrowser.selectedTab.linkedBrowser;
		var doc = browser.contentDocument;

		// Current rendering mode:
		var mode = this.branch.getBoolPref("mode");

		// Does currently shown browser have a vertical scroll bar?
		var vscroll = (browser.clientHeight < doc.documentElement.scrollHeight);

		// Does currently shown browser have a horizontal scroll bar?
		var hscroll = (browser.clientWidth < doc.documentElement.scrollWidth) || (doc.body && (browser.clientWidth < doc.body.scrollWidth));

		// Current classes of bottom toolbar:
		var bar = document.getElementById("browser-bottombox");
		var classes = bar.className.length ? bar.className.split(" ") : [];

		// Remove old barlesque classes, if any:
		for(var i = 0; i < classes.length; i++)
		{
			if(classes[i].indexOf("barlesque-") == 0)
			{	
				classes.splice(i--, 1);
			}
		}

		// New classes:
		classes.push("barlesque-bar");
		classes.push("barlesque-" + (mode ? "left" : "right"));

		if(!mode && vscroll)
			classes.push("barlesque-vscroll");

		if(hscroll)
			classes.push("barlesque-hscroll");

		// Assign new set of classes:
		bar.className = classes.join(" ");
	},

	removeStyles: function()
	{
		// Current classes of bottom toolbar:
		var bar = document.getElementById("browser-bottombox");
		var classes = bar.className.length ? bar.className.split(" ") : [];

		// Remove old barlesque classes, if any:
		for(var i = 0; i < classes.length; i++)
		{
			if(classes[i].indexOf("barlesque-") == 0)
			{	
				classes.splice(i--, 1);
			}
		}

		// Assign clean set of classes:
		bar.className = !classes.length ? "barlesque-empty-class" : classes.join(" ");
	}
};

window.addEventListener("load",   function() { barlesque.init();   }, false);
window.addEventListener("unload", function() { barlesque.uninit(); }, false);