if(!barlesque) { var barlesque = {}; }

barlesque.options = {

	onload: function()
	{
		// Preference branch for extension:
		var prefservice = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
		var branch = prefservice.getBranch("extensions.barlesque.");

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

		if(shorthide_disabled && shortmove_disabled)
		{
			document.getElementById("barlesque-options-warning-container").setAttribute("disabled", true);
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

		// Check if we should enable/disable the warning label:
		var warning = document.getElementById("barlesque-options-warning");
		var enable = document.getElementById("barlesque-check-shorthide").checked || document.getElementById("barlesque-check-shortmove").checked;

		if(enable)
		{
			warning.removeAttribute("disabled");
		}
		else
		{
			warning.setAttribute("disabled", true);
		}

	}
};