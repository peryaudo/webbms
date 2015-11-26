require('babel-polyfill');

import {WebBms} from './webbms';

const bms = new WebBms();
bms.start();
