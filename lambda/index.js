// This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
// Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
// session persistence, api calls, and more.
const Alexa = require('ask-sdk-core');
const aws4 = require('aws4');
import { sample } from 'lodash';

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    const speakOutput = 'Welcome, you can say Hello or Help. Which would you like to try?';
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
        },

      ]
    }
    console.log('searching for ' + term);

    const APIrequest = {
      host: `${process.env.OA_API_ID}.execute-api.eu-central-1.amazonaws.com`,
      method: 'GET',
      url: `${process.env.OA_API_ID}.execute-api.eu-central-1.amazonaws.com/prod/pages/search`,
      path: '/prod/pages/search',
      body: JSON.stringify(searchRequest),
      headers: {
      'Content-Type': 'application/json'
      }
    }

    let signedRequest = aws4.sign(APIrequest);

    delete signedRequest.headers['Host'];
    delete signedRequest.headers['Content-Length'];


    let response = await fetch(signedRequest);
    let result = response.data.results.filter((item) => {
        if (item.title.toLowerCase().includes(term.toLowerCase())) {
            return true;
          } else {
            return false;
          }
        }
      );
    let speechOutput = '';

    if (result.length===0) {
      speechOutput = 'Sorry, no matching items found.';
    } else {
      speechOutput = 'I found these matching items. ';
      const item = sample(result);
      let audio = '';
      for (let url of item.urls) {
        if (url.toLowerCase().endsWith('.mp3') && url.toLowerCase().startsWith('https')) {
          audio = encodeURI(url);
        }
      }
      if (audio) {
        speechOutput += `Item ${idx+1} is ${result[idx].description} located in the ${result[idx].ocean} ocean, tagged with ${result[idx].tags}. I'll now play you the audio. <audio src="${audio}" /> `;
      }
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
    const speakOutput = 'You can say hello to me! How can I help?';

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
    HelloWorldIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler,
    AudioSearchHandler
    ) 
  .addErrorHandlers(
    ErrorHandler,
    )
  .lambda();
