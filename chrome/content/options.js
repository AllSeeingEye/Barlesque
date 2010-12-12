if(!barlesque) { var barlesque = {}; }

barlesque.options = {

	onload: function()
	{
		// Preference branch for extension:
		var prefservice = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
		var branch = prefservice.getBranch("extensions.barlesque.");

		// Disable the shortcut customization fields based on current state of preferences:
		var shorthide = document.getElementById("barlesque-shorthide-container");
		var shorthide_disabled = !branch.getBoolPref("shorthide");

		if(shorthide_disabled)
		{
			for(var i = 0; i < shorthide.childNodes.length; i++)
			{
				shorthide.childNodes[i].setAttribute("disabled", true);
			}
		}

		var shortmove = document.getElementById("barlesque-shortmove-container");
		var shortmove_disabled = !branch.getBoolPref("shortmove");

		if(shortmove_disabled)
		{
			for(var i = 0; i < shortmove.childNodes.length; i++)
			{
				shortmove.childNodes[i].setAttribute("disabled", true);
			}
		}

		// Disable the timed collapse section based on current state of preferences:
		var timed = document.getElementById("barlesque-timed-container");
		var timed_disabled = !branch.getBoolPref("timed");

		if(timed_disabled)
		{
			for(var i = 0; i < timed.childNodes.length; i++)
			{
				timed.childNodes[i].setAttribute("disabled", true);
			}
		}

	},

	oncheck: function(containerId, value)
	{
		var container = document.getElementById(containerId);

		for(var i = 0; i < container.childNodes.length; i++)
		{
			if(value)
			{
				container.childNodes[i].removeAttribute("disabled");
			}
			else
			{
				container.childNodes[i].setAttribute("disabled", true);
			}
		}
	}
};