// This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
// Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
// session persistence, api calls, and more.
const Alexa = require('ask-sdk-core');
const aws4 = require('aws4');
const sample = require('lodash').sample;
const fromHTML = require('@acrossthecloud/speakhtml').fromHTML;
const axios = require('axios');

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    const speakOutput = 'Welcome, you can search for a story about something, or listen to an item about something, or just ask to listen to a story, or listen to an item for a wider selection.';
    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  }
};

const AudioSearchHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;

    return request.type === 'IntentRequest' && request.intent.name === 'AudioItemIntent';
  },
  handle: async (handlerInput) => {
    console.log('running items handler');
    const request = handlerInput.requestEnvelope.request;
    const responseBuilder = handlerInput.responseBuilder;

    let term = '';
    if (request.intent.slots.keyword.value && request.intent.slots.keyword.value !== "?") {
      term = request.intent.slots.keyword.value;
    }

    const searchRequest = {
      limit: 100, 
      criteria: [
        {
          "field": "item_type",
          "value": "Audio"
        }
      ]
    }
    console.log('searching for ' + term);

    const APIrequest = {
      host: `${process.env.OA_API_ID}.execute-api.eu-central-1.amazonaws.com`,
      method: 'POST',
      url: `https://${process.env.OA_API_ID}.execute-api.eu-central-1.amazonaws.com/prod/pages/search`,
      path: '/prod/pages/search',
      data: searchRequest
    }

    let signedRequest = aws4.sign(APIrequest);

    delete signedRequest.headers['Host'];
    delete signedRequest.headers['Content-Length'];

    console.log(signedRequest);

    let response = await axios(signedRequest);
    let result;
    if (term) {
      result = response.data.results.filter((item) => {
        if (item.title.toLowerCase().includes(term.toLowerCase())) {
            return true;
          } else {
            return false;
          }
        }
      );
    } else {
      result = response.data.results;
    }
    console.log(result);
    let speechOutput = '';

    if (result.length===0) {
      speechOutput = 'Sorry, no matching items found.';
    } else {
      speechOutput = '';
      const item = sample(result);
      let audio = '';

      let url = `${process.env.ALEXA_CDN_BASE_URL}/${item.s3_key.slice(0,-4)}_Alexa_audio.mp3`;
      console.log(url);
      audio = encodeURI(url);

      if (audio) {
        speechOutput += `Playing an excerpt from ${item.title} by ${item.creators[0]}. To listen to the full audio please visit Ocean-Archive.org. <audio src="${audio}" />`;
      }
    }
    return responseBuilder.speak(speechOutput).getResponse();
  }
};


// truncate keeping tags matched, from https://www.titanwolf.org/Network/q/9e657c27-24a1-450d-9ecc-8e48fc173f78/y
const truncate = (s, approxNumChars) => {
  var taggish = /<[^>]+>/g;
  var s = s.slice(0, approxNumChars); // ignores tag lengths for solution brevity
  s = s.replace(/<[^>]*$/, '');  // rm any trailing partial tags
  tags = s.match(taggish);

  // find out which tags are unmatched
  var openTagsSeen = [];
  for (tag_i in tags) {
    var tag = tags[tag_i];
    if (tag.match(/<[^>]+>/) !== null) {
      openTagsSeen.push(tag);
    }
    else {
      // quick version that assumes your HTML is correctly formatted (alas) -- else we would have to check the content inside for matches and loop through the opentags
      openTagsSeen.pop();
    }
  }

  // reverse and close unmatched tags
  openTagsSeen.reverse();
  for (tag_i in openTagsSeen) {
    s += ('<\\' + openTagsSeen[tag_i].match(/\w+/)[0] + '>');
  }
  return s + '.';
}

const StoryHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;

    return request.type === 'IntentRequest' && request.intent.name === 'StoryItemIntent';
  },
  handle: async (handlerInput) => {
    console.log('running story items handler');
    const request = handlerInput.requestEnvelope.request;
    const responseBuilder = handlerInput.responseBuilder;
    let speechOutput = '';

    let term = '';
    if (request.intent.slots.keyword.value && request.intent.slots.keyword.value !== "?") {
      term = request.intent.slots.keyword.value;
    }
    term = encodeURIComponent(term);

    console.log('searching for ' + term);
    let response;
    try {    
      response = await axios(`${process.env.WP_BASE_URL}/wp-json/wp/v2/posts?search=${term}`);
    } catch (e) {
      console.error(e);
    }
    let result = response.data;
    console.log(result);

    if (result.length===0) {
      speechOutput = 'Sorry, no matching items found.';
    } else {
      const post = sample(result);
      console.log(post);
      let authors = [];
      await Promise.all(post.categories.map(async (category)=>{
        const categoryResponse = await axios(`${process.env.WP_BASE_URL}/wp-json/wp/v2/categories/${category}`);
        const categoryData = categoryResponse.data;
        console.log(categoryData);
        if (categoryData.parent===370) { // author category
          authors.push(categoryData.name)
        }
      }));
      console.log(authors);
      let authorSpeech = '';
      if (authors.length > 0) {
        authorSpeech += 'By ';
        if (authors.length >= 3) {
          authors.slice(0,-2).forEach((author)=>{
            authorSpeech += ' ' + author + ','
          });
          authorSpeech += authors[authors.length-2] + ' and ' + authors[authors.length-1];
        } else if (authors.length==2) {
          authorSpeech += ' ' + authors[0] + ' and ' + authors[1] + '.';
        } else {
          authorSpeech += authors[0] + '.';
        }
        authorSpeech += '<break strength="strong"/>';
      }
      const filterFootnotes = (fragment) => {
        if (fragment.tagName.toLowerCase==='ul' && fragment.classList.includes('modern-footnotes-list')) {
          return true;
        } else {
          return false;
        }
      }
      let storyContent = fromHTML('<html><body>'+post.content.rendered+'</body></html>',false,filterFootnotes);
      storyContent.replace(/{{{(keyword_tag:)([\w ]+)}}}/g,'$2').replace(/{{{(concept_tag:)([\w ]+)}}}/g,'$2');
      if (storyContent.length > 7000) {
        storyContent = truncate(storyContent,7000) + '<break strength="strong"/>';
        speechOutput = `Playing you an excerpt from ${post.title.rendered} by ${authorSpeech}. To read the full story, visit Ocean-Archive.org. ${storyContent}`;
      } else {
        speechOutput = `${post.title.rendered} by ${authorSpeech}. ${storyContent}`;
      }
      console.log(storyContent);
      console.log(speechOutput);

    }
    return responseBuilder.speak(speechOutput).getResponse();
  }
};


const HelpIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const speakOutput = 'The full set of requests I understand are "listen to an item about {keyword}", "listen to an item", "play an item about {keyword}", "play an item", "search items for {keyword}", "listen to a story about {keyword}", "listen to a story", "tell me a story about {keyword}", "tell me a story", or "search stories for {keyword}';

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  }
};
const AboutIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const speakOutput = 'Ocean-Archive.org is an archive of ocean pictures, movies, audio and stories developed by the TBA21–Academy in collaboration with Across the Cloud.';

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  }
};
const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
        || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
  },
  handle(handlerInput) {
    const speakOutput = 'Goodbye!';
    return handlerInput.responseBuilder
      .speak(speakOutput)
      .getResponse();
  }
};
const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    // Any cleanup logic goes here.
    return handlerInput.responseBuilder.getResponse();
  }
};


// Generic error handling to capture any syntax or routing errors. If you receive an error
// stating the request handler chain is not found, you have not implemented a handler for
// the intent being invoked or included it in the skill builder below.
const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log(`~~~~ Error handled: ${error.stack}`);
    const speakOutput = `Sorry, I had trouble doing what you asked. Please try again.`;

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  }
};

// The SkillBuilder acts as the entry point for your skill, routing all request and response
// payloads to the handlers above. Make sure any new handlers or interceptors you've
// defined are included below. The order matters - they're processed top to bottom.
exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    HelpIntentHandler,
    AboutIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler,
    AudioSearchHandler,
    StoryHandler,
    ) 
  .addErrorHandlers(
    ErrorHandler,
    )
  .lambda();
