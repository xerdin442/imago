import 'package:flutter/material.dart';

class BaseController extends ChangeNotifier {
  
  bool _isDarkMode = false;
  //get
  bool get isDarkMode => _isDarkMode;
  //set
  set isDarkMode(bool value) {
    _isDarkMode = value;
    notifyListeners();
  }


  void rebuild() {

    if(!hasListeners) return;
    // print('rebuild');
    notifyListeners();
  }

  BuildContext context;

  BaseController(this.context);

  bool _isBusy = false;
  String? errorMessage;

  set isBusy(bool value) {
    _isBusy = value;
    notifyListeners();
  }

  bool get isBusy => _isBusy;

  void setErrorMessage(String? message) {
    errorMessage = message;
    notifyListeners();
  }

  void clearErrorMessage() {
    errorMessage = null;
    notifyListeners();
  }

  void reset() {
    isBusy = false;
    errorMessage = null;
  }
}
