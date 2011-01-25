// TODO(drheld): Count duchies / dukes / etc here.
var special_counts = new Object();

// For players who have spaces in their names, a map from name to name
// rewritten to have underscores instead. Pretty ugly, but it works.
var player_rewrites = new Object();

// Map from player name to score for that player (not counting special cards).
var scores = new Object();

// Map from player name to number of cards in that player's deck.
var decks = new Object();

// Places to print number of cards and points.
var deck_spot;
var points_spot;

var started = false;

var last_player = "";
var last_reveal_card = "";

function debugString() {
  return "[Scores: " + JSON.stringify(scores) + "] " +
         "[Cards: " + JSON.stringify(decks) + "]";
}

function pointsForCard(card) {
  if (card == undefined) {
    alert("Undefined card for points...");
    return 0;
  }
  if (card.indexOf("Colony") == 0) return 10;
  if (card.indexOf("Province") == 0) return 6;
  if (card.indexOf("Duchy") == 0) return 3;
  if (card.indexOf("Estate") == 0) return 1;
  if (card.indexOf("Curse") == 0) return -1;

  if (card.indexOf("Island") == 0) return 2;
  if (card.indexOf("Nobles") == 0) return 2;
  if (card.indexOf("Harem") == 0) return 2;
  if (card.indexOf("Great Hall") == 0) return 1;

  return 0;
}

function changeScore(player, points) {
  if (typeof scores[player] == "undefined") {
    scores[player] = 3;
  }
  points = parseInt(points);
  scores[player] = scores[player] + points;
}

function gainCard(player, card, count) {
  if (player == null) return;
  count = parseInt(count);

  if (typeof decks[player] == "undefined") {
    decks[player] = 10;
  }

  changeScore(player, pointsForCard(card) * count);
  decks[player] = decks[player] + count;
}

function findTrailingPlayer(text) {
  var arr = text.match(/ ([A-Za-z0-9]+)\./);
  if (arr.length == 2) {
    return arr[1];
  }
  return null;
}

function maybeHandleTurnChange(text) {
  if (text.indexOf("---") != -1) {
    // This must be a turn start.
    if (text.match(/Your turn/) != null) {
      last_player = "You";
    } else {
      var arr = text.match(/--- (.+)'s turn ---/);
      if (arr != null && arr.length == 2) {
        last_player = arr[1];
      } else {
        alert("Couldn't handle turn change: " + text);
      }
    }
    return true;
  }
  return false;
}

function maybeReturnToSupply(text) {
  if (text.indexOf("it to the supply") != -1) {
    gainCard(last_player, last_reveal_card, -1);
    return true;
  } else {
    var arr = text.match("([0-9]*) copies to the supply");
    if (arr != null && arr.length == 2) {
      gainCard(last_player, last_reveal_card, -arr[1]);
      return true;
    }
  }
  return false;
}

function maybeHandleSwindler(elems, text) {
  if (text.indexOf("replacing your") != -1) {
    if (elems.length == 2) {
      gainCard("You", elems[0].innerText, -1);
      gainCard("You", elems[1].innerText, 1);
    } else {
      alert("Replacing your has " + elems.length + " elements.");
    }
    return true;
  }
  if (text.indexOf("You replace") != -1) {
    if (elems.length == 2) {
      var arr = text.match("You replace ([^']*)'");
      if (arr != null && arr.length == 2) {
        gainCard(arr[1], elems[0].innerText, -1);
        gainCard(arr[1], elems[1].innerText, 1);
      } else {
        alert("Could not split: " + text);
      }
    } else {
      alert("Replacing your has " + elems.length + " elements.");
    }
    return true;
  }
  return false;
}

function maybeHandleSeaHag(text_arr, text) {
  if (text.indexOf("a Curse on top of") != -1) {
    gainCard(text_arr[0], "Curse", 1);
    return true;
  }
  return false;
}

function maybeHandleVp(text) {
  var re = new RegExp("[+]([0-9]+) ▼");
  var arr = text.match(re);
  if (arr != null && arr.length == 2) {
    changeScore(last_player, arr[1]);
  }
}

function getCardCount(card, text) {
  var count = 1;
  var re = new RegExp("([0-9]+) " + card);
  var arr = text.match(re);
  if (arr != null && arr.length == 2) {
    count = arr[1];
  }
  return count;
}

function handleGainOrTrash(player, elems, text, multiplier) {
  for (elem in elems) {
    if (elems[elem].innerText != undefined) {
      var card = elems[elem].innerText;
      var count = getCardCount(card, text);
      gainCard(player, card, multiplier * count);
    }
  }
}

function handleLogEntry(node) {
  // Gaining VP could happen in combination with other stuff.
  maybeHandleVp(node.innerText);

  elems = node.getElementsByTagName("span");
  if (elems.length == 0) {
    if (maybeHandleTurnChange(node.innerText)) return;
    if (maybeReturnToSupply(node.innerText)) return;
    return;
  }

  // Remove leading stuff from the text.
  var text = node.innerText.split(" ");
  var i = 0;
  for (i = 0; i < text.length; i++) {
    if (text[i].match(/[A-Za-z0-9]/) != null) break;
  }
  if (i == text.length) return;
  text = text.slice(i);

  if (maybeHandleSwindler(elems, node.innerText)) return;
  if (maybeHandleSeaHag(text, node.innerText)) return;

  if (text[0] == "trashing") {
    return handleGainOrTrash(last_player, elems, node.innerText, -1);
  }
  if (text[1].indexOf("trash") == 0) {
    return handleGainOrTrash(text[0], elems, node.innerText, -1);
  }
  if (text[0] == "gaining") {
    return handleGainOrTrash(last_player, elems, node.innerText, 1);
  }
  if (text[1].indexOf("gain") == 0) {
    return handleGainOrTrash(text[0], elems, node.innerText, 1);
  }

  // Expect one element from here on out.
  if (elems.length > 1) return;

  // It's a single card action.
  var card = elems[0].innerText;

  var player = text[0];
  var action = text[1];
  var delta = 0;
  if (action.indexOf("buy") == 0) {
    var count = getCardCount(card, node.innerText);
    gainCard(player, card, count);
  } else if (action.indexOf("pass") == 0) {
    gainCard(player, card, -1);
    var other_player = findTrailingPlayer(node.innerText);
    gainCard(other_player, card, 1);
  } else if (action.indexOf("receive") == 0) {
    gainCard(player, card, 1);
    var other_player = findTrailingPlayer(node.innerText);
    gainCard(other_player, card, -1);
  } else if (action.indexOf("reveal") == 0) {
    last_reveal_card = card;
  }
}

function updateScores() {
  if (points_spot == undefined) return;
  var print_scores = "Points: "
  for (var score in scores) {
    print_scores = print_scores + " " + score + "=" + scores[score];
  }
  points_spot.innerHTML = print_scores;
}

function updateDeck() {
  if (deck_spot == undefined) return;
  var print_deck = "Cards: "
  for (var deck in decks) {
    print_deck = print_deck + " " + deck + "=" + decks[deck];
  }
  deck_spot.innerHTML = print_deck;
}

function initialize(doc) {
  started = true;
  special_counts = new Object();
  scores = new Object();
  decks = new Object();
  player_rewrites = new Object();

  updateScores();
  updateDeck();

  // Hack: collect player names with spaces in them. We'll rewrite them to
  // underscores and then all the text parsing works as normal.
  var re = new RegExp("Turn order is (.*) and then you.");
  var arr = doc.innerText.match(re);
  if (arr != null) {
    if (arr.length == 2 && arr[1].indexOf(" ") != -1) {
      player_rewrites[arr[1]] = arr[1].replace(/ /g, "_");
    }
  } else {
    // TODO(drheld): Handle multiplayer starts.
  }
}

function maybeRewriteName(doc) {
  if (doc.innerHTML != undefined && doc.innerHTML != null) {
    for (player in player_rewrites) {
      doc.innerHTML = doc.innerHTML.replace(player, player_rewrites[player]);
    }
  }
}

function handle(doc) {
  if (doc.constructor == HTMLDivElement &&
      doc.innerText.indexOf("Say") == 0) {
    deck_spot = doc.children[5];
    points_spot = doc.children[6];
  }

  if (doc.constructor == HTMLElement && doc.parentNode.id == "log" &&
      doc.innerText.indexOf("Turn order") != -1) {
    initialize(doc);
  }

  maybeRewriteName(doc);

  if (started && doc.constructor == HTMLElement && doc.parentNode.id == "log") {
    handleLogEntry(doc);
  }

  if (started) {
    updateScores();
    updateDeck();
  }
}


document.body.addEventListener('DOMNodeInserted', function(ev) {
  handle(ev.target);
});