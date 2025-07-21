// import 'dart:nativewrappers/_internal/vm/lib/ffi_allocation_patch.dart';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'controller.dart';

class BaseWidget<T extends ChangeNotifier> extends StatefulWidget {
  final T model;
  final Widget Function(BuildContext context, T model, Widget? child) builder;
  final Function(T)? onInitState;
  final Function(T)? didUpdateWidget;
  // final Function(AdaptiveThemeMode, T model)? onModeChanged;
  final bool disposeModel, showBusy;
  final Function()? onDispose;

  const BaseWidget(
      {super.key,
      required this.model,
      required this.builder,
      this.onInitState,
      this.didUpdateWidget,
      this.showBusy = true,
      // this.onModeChanged,
      this.onDispose,
      this.disposeModel = true});

  @override
  State<StatefulWidget> createState() => _BaseWidgetState<T>();
}

class _BaseWidgetState<T extends ChangeNotifier> extends State<BaseWidget<T>> {
  late T model;
  bool isOffline = false;
  @override
  void initState() {
    super.initState();
    model = widget.model;

    // Use a post-frame callback to ensure initialization happens after build
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (widget.onInitState != null) {
        widget.onInitState!(model);
      }
    });

    // ConnectivityService connectionStatus = ConnectivityService.getInstance();
    // connectionStatus.connectionChange.listen(connectionChanged);
  }

  @override
  void dispose() {
    super.dispose();
    widget.onDispose?.call();
  }

  @override
  void didUpdateWidget(covariant BaseWidget<T> oldWidget) {
    if (widget.didUpdateWidget != null) {
      widget.didUpdateWidget!(model);
    }
    super.didUpdateWidget(oldWidget);
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.disposeModel) {
      return AnnotatedRegion(
          value: defaultSystemUi(context),
          child: ChangeNotifierProvider<T>.value(
              value: model, child: getConsumer()));
    }
    return AnnotatedRegion(
        value: defaultSystemUi(context),
        child: ChangeNotifierProvider<T>(
            create: (context) => model, child: getConsumer()));
  }

  Consumer<T> getConsumer() => Consumer<T>(
      builder: (c, m, w) => Stack(
            children: [
              widget.builder(c, m, w),
              if ((m as BaseController).isBusy && widget.showBusy)
                Positioned.fill(
                    child: Container(
                        color: Theme.of(context)
                            .scaffoldBackgroundColor
                            // ignore: deprecated_member_use
                            .withOpacity(.5),
                        child: const Center(
                            child: CupertinoActivityIndicator(
                          color: Colors.white,
                          // strokeWidth: 2,
                        ))))
            ],
          ));

  void connectionChanged(dynamic hasConnection) {
    try {
      setState(() {
        // print('hasConnection:::$hasConnection');
        isOffline = !hasConnection;
        if (!hasConnection) {
          ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('You are currently offline')));
        }
      });
    } catch (_) {}
  }

SystemUiOverlayStyle defaultSystemUi(BuildContext context) {
  bool isLight = 1 == 1;
  return SystemUiOverlayStyle(
    systemNavigationBarContrastEnforced: false,
    systemNavigationBarColor: Colors.transparent,
    statusBarColor: Colors.transparent,
    systemStatusBarContrastEnforced: false,
    systemNavigationBarIconBrightness:
        isLight ? Brightness.light : Brightness.dark,
    statusBarBrightness: isLight ? Brightness.dark : Brightness.light,
    statusBarIconBrightness: isLight ? Brightness.dark : Brightness.light,
    systemNavigationBarDividerColor: Colors.transparent,
  );
}
}


