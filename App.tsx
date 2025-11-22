import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import {
  Inventory,
  InventoryItem,
  Condition,
  Cleanliness,
  HealthSafetyCheck,
  MeterType,
  SignatureEntry,
  Photo
} from './types';

import { generateId, formatDate, formatDateTime, compressImage } from './utils';
import { Button } from './components/Button';
import SignaturePad from './components/SignaturePad';
import {
  PREDEFINED_ROOMS,
  DEFAULT_ITEMS,
  METER_ITEMS,
  KITCHEN_ITEMS,
  MAJOR_APPLIANCES,
  REQUIRED_DOCUMENTS_LIST,
  CONDITION_COLORS,
  CLEANLINESS_COLORS,
  HS_QUESTIONS,
  DISCLAIMER_TEXT,
  GUIDANCE_NOTES,
  DECLARATION_TEXT
} from './constants';
