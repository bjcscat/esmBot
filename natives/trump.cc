#ifdef MAGICK_ENABLED
#include <Magick++.h>

#include <cstring>
#include <iostream>
#include <list>

#include "common.h"

using namespace std;
using namespace Magick;

ArgumentMap Trump(string type, string *outType, char *BufferData, size_t BufferLength,
            [[maybe_unused]] ArgumentMap Arguments, size_t *DataSize) {
    int delay = GetArgumentWithFallback<int>(Arguments, "delay", 0);
    Blob blob;

    list<Image> frames;
    list<Image> coalesced;
    list<Image> mid;
    Image watermark;
    try {
      readImages(&frames, Blob(BufferData, BufferLength));
    } catch (Magick::WarningCoder &warning) {
      cerr << "Coder Warning: " << warning.what() << endl;
    } catch (Magick::Warning &warning) {
      cerr << "Warning: " << warning.what() << endl;
    }
    watermark.read("./assets/images/trump.png");
    coalesceImages(&coalesced, frames.begin(), frames.end());

    for (Image &image : coalesced) {
      Image watermark_new = watermark;
      image.virtualPixelMethod(Magick::TransparentVirtualPixelMethod);
      image.backgroundColor("none");
      image.scale(Geometry("365x179!"));
      double arguments[16] = {0,   0,   207, 268, 365, 0,   548, 271,
                              365, 179, 558, 450, 0,   179, 193, 450};
      image.distort(Magick::PerspectiveDistortion, 16, arguments, true);
      image.extent(Geometry("800x450"), Magick::CenterGravity);
      watermark_new.composite(image, Geometry("-25+134"),
                              Magick::DstOverCompositeOp);
      watermark_new.magick(type);
      watermark_new.animationDelay(delay == 0 ? image.animationDelay() : delay);
      watermark_new.gifDisposeMethod(Magick::BackgroundDispose);
      mid.push_back(watermark_new);
    }

    optimizeTransparency(mid.begin(), mid.end());

    if (type == "gif") {
      for (Image &image : mid) {
        image.quantizeDitherMethod(FloydSteinbergDitherMethod);
        image.quantize();
      }
    }

    writeImages(mid.begin(), mid.end(), &blob);

    *DataSize = blob.length();

    char *data = (char *)malloc(*DataSize);
    memcpy(data, blob.data(), *DataSize);

    ArgumentMap output;
    output["buf"] = data;

    return output;
}

#endif